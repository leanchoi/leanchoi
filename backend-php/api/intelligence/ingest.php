<?php
/**
 * POST /api/intelligence/ingest.php — el VPS vuelca la telemetría cruda.
 *
 * Igual que `flush-stats.php`, este endpoint **no** lo llama el navegador: lo
 * llama el servidor de juego, y por eso se autentica con una firma HMAC del
 * cuerpo y no con un JWT. El navegador manda su telemetría por el WebSocket ya
 * autenticado; nunca hay un endpoint público de ingesta que se pueda inundar.
 *
 * Tres candados para no contar dos veces lo mismo:
 *  · `telemetria_lotes` guarda el `batchId`: un reintento del VPS no reingresa.
 *  · `telemetria_inteligencia.evento_id` es único: un evento repetido tampoco.
 *  · La lista blanca de nombres y categorías: lo que no está declarado en
 *    `/shared/types/telemetry.ts` no entra a la base, aunque venga firmado.
 *
 * Lo que NO hace: guardar quién. El `subject` llega ya pseudonimizado desde
 * Hostinger (HMAC rotativo del id de usuario) y acá se escribe tal cual.
 *
 * Cuerpo:
 * {
 *   "batchId": "uuid",
 *   "shard": "Esquel — Centro 01",
 *   "sentAt": "2027-06-01T12:00:00.000Z",
 *   "events": [ TelemetryEvent, ... ]
 * }
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use Esquel\Config;
use Esquel\Db;
use Esquel\Http;
use Esquel\Telemetry;

Http::cors(['POST', 'OPTIONS']);
Http::requireMethod('POST');

/* --- autenticación de servidor a servidor -------------------------------- */

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
        Http::error('IP_NO_AUTORIZADA', 'Esta IP no puede volcar telemetría.', 403);
    }
}

/* --- validación del lote -------------------------------------------------- */

$body = json_decode($raw, true);
if (!is_array($body)) {
    Http::error('INVALID_JSON', 'El cuerpo no es JSON válido.', 400);
}

$batchId = (string) ($body['batchId'] ?? '');
$origen = mb_substr((string) ($body['shard'] ?? 'vps'), 0, 48);
$eventos = $body['events'] ?? [];

if ($batchId === '' || !is_array($eventos)) {
    Http::error('LOTE_INVALIDO', 'Falta batchId o events.', 422);
}

$tope = (int) Config::get('telemetry.batch_max_events', 200);
if (count($eventos) > $tope) {
    Http::error('LOTE_GRANDE', "Máximo $tope eventos por lote.", 413);
}

/* --- normalización de un evento ------------------------------------------- */

$nombresValidos = array_flip(Telemetry::allowedEvents());
$tiposValidos = array_flip(Telemetry::allowedKinds());
$barriosValidos = array_flip(Telemetry::barrios());
$franjasValidas = array_flip(Telemetry::ageBands());
$generos = ['femenino', 'masculino', 'no_binario', 'prefiere_no_decir'];
$intereses = ['nulo', 'bajo', 'medio', 'alto', 'militante'];
$plataformas = ['desktop', 'mobile', 'tablet'];

/**
 * Convierte un evento del contrato a la fila de `telemetria_inteligencia`.
 * Devuelve `null` si el evento no pasa la lista blanca o le falta lo esencial.
 *
 * @return array<int, mixed>|null
 */
$aFila = static function (mixed $e) use (
    $nombresValidos,
    $tiposValidos,
    $barriosValidos,
    $franjasValidas,
    $generos,
    $intereses,
    $plataformas
): ?array {
    if (!is_array($e)) {
        return null;
    }

    $nombre = (string) ($e['name'] ?? '');
    $tipo = (string) ($e['kind'] ?? '');
    if (!isset($nombresValidos[$nombre]) || !isset($tiposValidos[$tipo])) {
        return null;
    }

    $eventoId = (string) ($e['eventId'] ?? '');
    $sujeto = (string) ($e['subject'] ?? '');
    $sesionRef = (string) ($e['sessionRef'] ?? '');
    if (strlen($eventoId) !== 36 || $sujeto === '' || strlen($sesionRef) !== 36) {
        return null;
    }
    // El sujeto es un HMAC truncado de 32 hex, sellado por el VPS a partir del
    // claim firmado del token. Cualquier otra forma significa que el evento no
    // pasó por esa puerta, así que no entra.
    if (preg_match('/^[0-9a-f]{32}$/', $sujeto) !== 1) {
        return null;
    }

    $ocurrido = strtotime((string) ($e['at'] ?? ''));
    if ($ocurrido === false) {
        return null;
    }
    // Un reloj adelantado no puede plantar eventos en el futuro ni en 1970.
    $ahora = time();
    if ($ocurrido > $ahora + 300 || $ocurrido < $ahora - 7 * 86400) {
        $ocurrido = $ahora;
    }

    $ctx = is_array($e['context'] ?? null) ? $e['context'] : [];
    $barrio = (string) ($ctx['barrio'] ?? 'otro');
    if (!isset($barriosValidos[$barrio])) {
        $barrio = 'otro';
    }
    $franja = $ctx['ageBand'] ?? null;
    if (!is_string($franja) || !isset($franjasValidas[$franja])) {
        $franja = null;
    }
    $genero = (string) ($ctx['gender'] ?? 'prefiere_no_decir');
    if (!in_array($genero, $generos, true)) {
        $genero = 'prefiere_no_decir';
    }
    $interes = (string) ($ctx['interest'] ?? 'medio');
    if (!in_array($interes, $intereses, true)) {
        $interes = 'medio';
    }
    $plataforma = (string) ($ctx['platform'] ?? 'desktop');
    if (!in_array($plataforma, $plataformas, true)) {
        $plataforma = 'desktop';
    }

    $celda = is_array($ctx['cell'] ?? null) ? $ctx['cell'] : null;
    $faccion = isset($ctx['factionId']) ? (int) $ctx['factionId'] : null;
    $rango = isset($ctx['rankLevel']) ? max(1, min(10, (int) $ctx['rankLevel'])) : null;
    $payload = is_array($e['payload'] ?? null) ? $e['payload'] : null;

    return [
        $eventoId,
        $tipo,
        $nombre,
        substr($sujeto, 0, 32),
        $sesionRef,
        gmdate('Y-m-d H:i:s.v', $ocurrido),
        $barrio,
        $franja,
        $genero,
        $interes,
        ($faccion !== null && $faccion > 0) ? $faccion : null,
        $rango,
        $celda !== null ? (int) ($celda['col'] ?? 0) : null,
        $celda !== null ? (int) ($celda['row'] ?? 0) : null,
        $plataforma,
        mb_substr((string) ($ctx['clientVersion'] ?? ''), 0, 24),
        max(0, min(23, (int) ($ctx['localHour'] ?? 0))),
        $payload !== null ? json_encode($payload, JSON_UNESCAPED_UNICODE) : null,
        max(1, (int) ($e['schemaVersion'] ?? 1)),
    ];
};

/* --- inserción idempotente ------------------------------------------------ */

$resultado = Db::transaction(static function () use ($batchId, $origen, $eventos, $aFila): array {
    // El candado del lote: si ya entró, salimos sin tocar nada.
    $lote = Db::run(
        'INSERT IGNORE INTO telemetria_lotes (lote_id, origen, eventos, recibido_en)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
        [$batchId, $origen, count($eventos)]
    );
    if ($lote->rowCount() === 0) {
        return ['duplicado' => true, 'aceptados' => 0, 'rechazados' => 0];
    }

    $aceptados = 0;
    $rechazados = 0;

    $sql = 'INSERT IGNORE INTO telemetria_inteligencia
                (evento_id, tipo, nombre, sujeto, sesion_ref, ocurrido_en, recibido_en,
                 barrio, franja_etaria, genero, interes, faccion_id, rango_nivel,
                 celda_col, celda_row, plataforma, client_version, hora_local, payload, schema_version)
            VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    foreach ($eventos as $evento) {
        $fila = $aFila($evento);
        if ($fila === null) {
            $rechazados++;
            continue;
        }
        // `recibido_en` lo pone la base: un reloj adulterado en el cliente no
        // puede mentir sobre cuándo llegó el dato.
        $insert = Db::run($sql, $fila);
        if ($insert->rowCount() > 0) {
            $aceptados++;
        } else {
            // Ya estaba: cuenta como aceptado, no como error. El VPS reintentó.
            $aceptados++;
        }
    }

    Db::run(
        'UPDATE telemetria_lotes SET aceptados = ?, rechazados = ? WHERE lote_id = ?',
        [$aceptados, $rechazados, $batchId]
    );

    return ['duplicado' => false, 'aceptados' => $aceptados, 'rechazados' => $rechazados];
});

if ($resultado['duplicado']) {
    Http::json(['ok' => true, 'accepted' => 0, 'duplicated' => true, 'batchId' => $batchId]);
}

Http::json([
    'ok' => true,
    'accepted' => $resultado['aceptados'],
    'rejected' => $resultado['rechazados'],
    'batchId' => $batchId,
]);
