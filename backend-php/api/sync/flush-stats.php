<?php
/**
 * POST /api/sync/flush-stats.php — el VPS vuelca lo que se ganó jugando.
 *
 * Este endpoint NO lo llama el navegador: lo llama el servidor de juego cada
 * treinta segundos y cuando alguien se desconecta. Por eso no usa JWT sino una
 * firma HMAC del cuerpo con el secreto compartido (`HOSTINGER_API_KEY`), más una
 * lista blanca de IPs si está configurada.
 *
 * Tres decisiones que evitan perder o duplicar progreso:
 *  · Los deltas se **suman** (`xp = xp + ?`), no se pisan: si llegan dos lotes
 *    desordenados, el total es el mismo.
 *  · Cada lote trae un `batchId` que se guarda; si el VPS reintenta después de un
 *    timeout, el segundo intento se descarta y nadie cobra dos veces la guita.
 *  · Todo va en una transacción: o entra el lote entero o no entra nada.
 *
 * Cuerpo:
 * {
 *   "batchId": "uuid",
 *   "shard": "Esquel — Centro 01",
 *   "sentAt": "2027-06-01T12:00:00.000Z",
 *   "deltas": [{ "characterId": "5001", "xp": 320, "reputation": 5, "money": 12000,
 *                "playSeconds": 900, "x": 12.5, "y": 0, "z": -40.2,
 *                "rankTier": 3, "health": 100 }]
 * }
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use Esquel\Config;
use Esquel\Db;
use Esquel\Http;

Http::cors(['POST', 'OPTIONS']);
Http::requireMethod('POST');

/* --- autenticación de servidor a servidor ------------------------------- */

$secret = (string) Config::get('realtime.internal_hmac_secret');
if ($secret === '') {
    Http::error('CONFIG_INCOMPLETA', 'Falta el secreto compartido con el VPS.', 500);
}

$raw = Http::rawBody();
$firmaRecibida = (string) ($_SERVER['HTTP_X_ESQUEL_SIGNATURE'] ?? '');
$firmaEsperada = hash_hmac('sha256', $raw, $secret);

if ($firmaRecibida === '' || !hash_equals($firmaEsperada, $firmaRecibida)) {
    Http::error('FIRMA_INVALIDA', 'La firma del lote no coincide.', 401);
}

$allowedIps = (array) Config::get('realtime.allowed_ips', []);
if ($allowedIps !== []) {
    $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    if (!in_array($remote, $allowedIps, true)) {
        Http::error('IP_NO_AUTORIZADA', 'Esta IP no puede volcar estadísticas.', 403);
    }
}

/* --- validación del lote ------------------------------------------------ */

$body = json_decode($raw, true);
if (!is_array($body)) {
    Http::error('INVALID_JSON', 'El cuerpo no es JSON válido.', 400);
}

$batchId = (string) ($body['batchId'] ?? '');
$shard = mb_substr((string) ($body['shard'] ?? 'desconocido'), 0, 48);
$deltas = $body['deltas'] ?? [];

if ($batchId === '' || !is_array($deltas)) {
    Http::error('LOTE_INVALIDO', 'Falta batchId o deltas.', 422);
}
if (count($deltas) > 500) {
    Http::error('LOTE_GRANDE', 'Máximo 500 personajes por lote.', 413);
}

/* --- aplicación idempotente --------------------------------------------- */

$persistidos = Db::transaction(static function () use ($batchId, $shard, $deltas): int {
    // La clave única de `sync_lotes` es el candado de idempotencia: si el lote ya
    // se aplicó, el INSERT no hace nada y salimos con 0.
    $insert = Db::run(
        'INSERT IGNORE INTO sync_lotes (batch_id, shard, personajes, recibido_en)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
        [$batchId, $shard, count($deltas)]
    );
    if ($insert->rowCount() === 0) {
        return -1; // repetido
    }

    $aplicados = 0;
    foreach ($deltas as $delta) {
        if (!is_array($delta) || !isset($delta['characterId'])) {
            continue;
        }
        $characterId = (int) $delta['characterId'];
        if ($characterId <= 0) {
            continue;
        }

        $xp = max(0, (int) ($delta['xp'] ?? 0));
        $reputacion = (int) ($delta['reputation'] ?? 0);
        $guita = (int) ($delta['money'] ?? 0);
        $segundos = max(0, (int) ($delta['playSeconds'] ?? 0));
        $salud = max(0, min(9999, (int) ($delta['health'] ?? 100)));
        $rango = max(1, min(10, (int) ($delta['rankTier'] ?? 1)));

        $statement = Db::run(
            'UPDATE personajes
                SET xp = xp + ?,
                    reputacion = GREATEST(-1000, LEAST(1000, reputacion + ?)),
                    guita_centavos = GREATEST(0, CAST(guita_centavos AS SIGNED) + ?),
                    playtime_segundos = playtime_segundos + ?,
                    salud = ?,
                    rango_nivel = GREATEST(rango_nivel, ?),
                    pos_x = ?, pos_y = ?, pos_z = ?,
                    ultimo_online_en = UTC_TIMESTAMP(3)
              WHERE id = ? AND estado = "activo"',
            [
                $xp,
                $reputacion,
                $guita,
                $segundos,
                $salud,
                $rango,
                (float) ($delta['x'] ?? 0),
                (float) ($delta['y'] ?? 0),
                (float) ($delta['z'] ?? 0),
                $characterId,
            ]
        );

        if ($statement->rowCount() > 0) {
            $aplicados++;
        }
    }

    return $aplicados;
});

if ($persistidos === -1) {
    // Idempotencia: el VPS reintentó un lote que ya habíamos aplicado.
    Http::json(['ok' => true, 'persisted' => 0, 'duplicado' => true]);
}

Http::json(['ok' => true, 'persisted' => $persistidos, 'batchId' => $batchId]);
