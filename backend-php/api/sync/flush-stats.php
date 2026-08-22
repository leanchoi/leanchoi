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
 *                "rankTier": 3, "health": 100,
 *                "quests": [{ "instanceId": "...", "slug": "pegatina_relampago", ... }],
 *                "campaigns": [{ "archetype": "outsider", "seed": 12345, ... }] }]
 * }
 *
 * `quests` y `campaigns` son opcionales y casi siempre vienen vacíos: sólo
 * aparecen en el lote donde el jugador cerró una misión o liquidó una campaña
 * del Modo Candidato. El historial de misiones se inserta con IGNORE contra
 * `uq_historial_participacion` (instancia + personaje), así un reintento del
 * VPS no duplica la fila aunque el lote sí sea nuevo.
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


/* --- historial de misiones y campañas ------------------------------------ */

/** Tipologías Live-Ops vigentes (`QUEST_TYPES` en minúscula). */
const TIPOS_MISION = [
    'pegatina_relampago', 'banderazo_callejero', 'operacion_desmentida', 'reparto_barrial',
    'caravana_de_bloques', 'corte_de_cinta', 'temporal_cordillerano', 'guerra_de_punteros',
    'conferencia_prensa', 'sondeo_vecinal',
];
const DISPARADORES = ['noticia', 'clima', 'territorio', 'calendario', 'admin'];
const RESULTADOS = ['completada', 'parcial', 'fallada', 'abandonada', 'expirada'];
const BARRIOS = [
    'centro', 'badenes', 'ceferino', 'bella_vista', 'don_bosco', 'estacion',
    'zona_norte', 'alta_esquel', 'plan_1000', 'valle_chico', 'otro',
];
const ARQUETIPOS = ['oficialista', 'outsider', 'caudillo'];

/** Fecha del VPS a `DATETIME(3)` de MySQL, o null si vino cualquier cosa. */
function aDatetime(mixed $iso): ?string
{
    if (!is_string($iso) || $iso === '') {
        return null;
    }
    $ts = strtotime($iso);
    if ($ts === false) {
        return null;
    }
    // Los milisegundos vienen en el ISO; se conservan si están.
    $ms = 0;
    if (preg_match('/\.(\d{1,3})/', $iso, $m) === 1) {
        $ms = (int) str_pad($m[1], 3, '0');
    }
    return gmdate('Y-m-d H:i:s', $ts) . '.' . str_pad((string) $ms, 3, '0', STR_PAD_LEFT);
}

/**
 * Escribe las participaciones cerradas en `misiones_historial`.
 *
 * INSERT IGNORE contra `uq_historial_participacion`: si el mismo personaje ya
 * tiene registrada esa instancia, la fila no se duplica. Es la segunda red de
 * seguridad después del `batchId`.
 */
function persistirMisiones(int $characterId, mixed $misiones): void
{
    if (!is_array($misiones) || $misiones === []) {
        return;
    }

    foreach (array_slice($misiones, 0, 50) as $m) {
        if (!is_array($m)) {
            continue;
        }
        $instancia = mb_substr((string) ($m['instanceId'] ?? ''), 0, 36);
        $slug = mb_substr((string) ($m['slug'] ?? ''), 0, 64);
        $tipo = (string) ($m['type'] ?? '');
        $tipo = strtolower($tipo);
        if ($instancia === '' || $slug === '' || !in_array($tipo, TIPOS_MISION, true)) {
            continue;
        }

        $disparador = strtolower((string) ($m['trigger'] ?? 'calendario'));
        if (!in_array($disparador, DISPARADORES, true)) {
            $disparador = 'calendario';
        }
        $barrio = strtolower((string) ($m['barrio'] ?? 'otro'));
        if (!in_array($barrio, BARRIOS, true)) {
            $barrio = 'otro';
        }
        $resultado = strtolower((string) ($m['outcome'] ?? 'parcial'));
        if (!in_array($resultado, RESULTADOS, true)) {
            $resultado = 'parcial';
        }

        $iniciada = aDatetime($m['startedAt'] ?? null);
        if ($iniciada === null) {
            continue; // sin fecha de inicio la fila no sirve para las vistas por día
        }

        $faccion = (int) ($m['factionId'] ?? 0);
        $contadores = is_array($m['counters'] ?? null) ? $m['counters'] : [];

        Db::run(
            'INSERT IGNORE INTO misiones_historial
                (personaje_id, instancia_id, mision_slug, tipo, disparador, barrio, zona_id,
                 faccion_id, rango_nivel, iniciada_en, finalizada_en, duracion_s, resultado,
                 completitud, contadores, contribucion, xp_ganada, rep_ganada, guita_ganada,
                 territorio_score, clima, hora_local, seed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $characterId,
                $instancia,
                $slug,
                $tipo,
                $disparador,
                $barrio,
                ($m['zoneId'] ?? null) !== null ? mb_substr((string) $m['zoneId'], 0, 48) : null,
                $faccion > 0 ? $faccion : null,
                max(1, min(10, (int) ($m['rankTier'] ?? 1))),
                $iniciada,
                aDatetime($m['finishedAt'] ?? null),
                max(0, min(65535, (int) ($m['durationS'] ?? 0))),
                $resultado,
                max(0, min(1, (float) ($m['completion'] ?? 0))),
                json_encode($contadores, JSON_UNESCAPED_UNICODE),
                max(0, min(1, (float) ($m['contribution'] ?? 0))),
                (int) ($m['xp'] ?? 0),
                (int) ($m['reputation'] ?? 0),
                (int) ($m['money'] ?? 0),
                (float) ($m['territoryScore'] ?? 0),
                mb_substr((string) ($m['weather'] ?? ''), 0, 16),
                max(0, min(23, (int) ($m['localHour'] ?? 0))),
                max(0, (int) ($m['seed'] ?? 0)),
            ]
        );
    }
}

/** Escribe las campañas del Modo Candidato ya liquidadas por el servidor. */
function persistirCampanas(int $characterId, mixed $campanas): void
{
    if (!is_array($campanas) || $campanas === []) {
        return;
    }

    foreach (array_slice($campanas, 0, 10) as $c) {
        if (!is_array($c)) {
            continue;
        }
        $arquetipo = strtolower((string) ($c['archetype'] ?? ''));
        if (!in_array($arquetipo, ARQUETIPOS, true)) {
            continue;
        }
        $decisiones = is_array($c['decisions'] ?? null) ? $c['decisions'] : [];

        Db::run(
            'INSERT INTO campanas_candidato
                (personaje_id, arquetipo, semilla, decisiones, caja_campana, rosca_politica,
                 imagen_publica, nivel_escandalo, final, turnos_jugados,
                 xp_otorgada, reputacion_otorgada, guita_otorgada)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $characterId,
                $arquetipo,
                max(0, (int) ($c['seed'] ?? 0)),
                json_encode($decisiones, JSON_UNESCAPED_UNICODE),
                max(0, min(255, (int) ($c['cajaCampana'] ?? 0))),
                max(0, min(255, (int) ($c['roscaPolitica'] ?? 0))),
                max(0, min(255, (int) ($c['imagenPublica'] ?? 0))),
                max(0, min(255, (int) ($c['nivelEscandalo'] ?? 0))),
                mb_substr((string) ($c['ending'] ?? 'sin_final'), 0, 32),
                max(0, min(255, (int) ($c['turnsPlayed'] ?? 0))),
                max(0, (int) ($c['xp'] ?? 0)),
                (int) ($c['reputation'] ?? 0),
                (int) ($c['money'] ?? 0),
            ]
        );
    }
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

        persistirMisiones($characterId, $delta['quests'] ?? []);
        persistirCampanas($characterId, $delta['campaigns'] ?? []);
    }

    return $aplicados;
});

if ($persistidos === -1) {
    // Idempotencia: el VPS reintentó un lote que ya habíamos aplicado.
    Http::json(['ok' => true, 'persisted' => 0, 'duplicado' => true]);
}

Http::json(['ok' => true, 'persisted' => $persistidos, 'batchId' => $batchId]);
