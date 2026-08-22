<?php
/**
 * GET /api/intelligence/metrics.php — lo que alimenta el Dashboard de Campaña.
 *
 * Devuelve el `DashboardSnapshot` de `/shared/types/intelligence.ts`: mapa de
 * calor por barrio, proyección electoral con reparto de bancas, tendencia,
 * participación en misiones y rendimiento de los comercios.
 *
 * **La regla que gobierna este archivo:** ninguna celda con menos de
 * `K_ANON_MIN` sujetos distintos sale con valor. Se devuelve el conteo —para que
 * el dashboard pueda decir "faltan datos"— y el valor va en cero con
 * `publishable: false`. No se redondea, no se suaviza, no se "estima". Un dato
 * de tres personas no es un dato.
 *
 * Se calcula sobre la tabla cruda con una ventana de días. Cuando el volumen lo
 * pida, el mismo cálculo pasa a un job nocturno que llena `telemetria_agregados`
 * y este endpoint lee de ahí sin cambiar el contrato.
 *
 * Parámetros:
 *   ?dias=1..30     ventana de agregación (por defecto 7)
 *   ?formato=json   json (por defecto) | csv
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use Esquel\AdminAuth;
use Esquel\Db;
use Esquel\Http;
use Esquel\Telemetry;

Http::cors(['GET', 'OPTIONS']);
Http::requireMethod('GET');
AdminAuth::require();

$dias = max(1, min(30, (int) ($_GET['dias'] ?? 7)));
$formato = ($_GET['formato'] ?? 'json') === 'csv' ? 'csv' : 'json';
$k = Telemetry::kAnonMin();
$desde = gmdate('Y-m-d', time() - ($dias - 1) * 86400);

/* --- 1. Mapa de calor por barrio ------------------------------------------ */

/**
 * Un query por barrio con tres cosas: intención de voto, actividad y humor.
 * Se cuentan **sujetos distintos**, no eventos: mil eventos de una persona no
 * hacen un barrio militante.
 */
$votos = Db::run(
    "SELECT barrio,
            COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.targetFaction')), '0') AS faccion,
            COUNT(DISTINCT sujeto) AS sujetos
       FROM telemetria_inteligencia
      WHERE nombre = 'vote_intent' AND dia >= ?
      GROUP BY barrio, faccion",
    [$desde]
)->fetchAll();

$actividad = Db::run(
    "SELECT barrio,
            COUNT(*) AS eventos,
            COUNT(DISTINCT sujeto) AS sujetos
       FROM telemetria_inteligencia
      WHERE tipo IN ('movimiento','progresion') AND dia >= ?
      GROUP BY barrio",
    [$desde]
)->fetchAll();

$humor = Db::run(
    "SELECT barrio,
            AVG(CASE
                  WHEN nombre = 'candidate_reaction' THEN JSON_EXTRACT(payload, '$.approval')
                  ELSE JSON_EXTRACT(payload, '$.sentiment')
                END) AS humor,
            COUNT(DISTINCT sujeto) AS sujetos
       FROM telemetria_inteligencia
      WHERE nombre IN ('candidate_reaction','news_reaction') AND dia >= ?
      GROUP BY barrio",
    [$desde]
)->fetchAll();

$porBarrio = [];
foreach (Telemetry::barrios() as $barrio) {
    $porBarrio[$barrio] = ['votes' => [], 'subjects' => 0, 'activity' => 0, 'mood' => 0.0, 'moodSubjects' => 0];
}

foreach ($votos as $fila) {
    $b = (string) $fila['barrio'];
    if (!isset($porBarrio[$b])) {
        continue;
    }
    $faccion = (int) $fila['faccion'];
    $n = (int) $fila['sujetos'];
    $porBarrio[$b]['votes'][$faccion] = ($porBarrio[$b]['votes'][$faccion] ?? 0) + $n;
    $porBarrio[$b]['subjects'] += $n;
}
foreach ($actividad as $fila) {
    $b = (string) $fila['barrio'];
    if (!isset($porBarrio[$b])) {
        continue;
    }
    $porBarrio[$b]['activity'] = (int) $fila['eventos'];
    $porBarrio[$b]['subjects'] = max($porBarrio[$b]['subjects'], (int) $fila['sujetos']);
}
foreach ($humor as $fila) {
    $b = (string) $fila['barrio'];
    if (!isset($porBarrio[$b])) {
        continue;
    }
    $porBarrio[$b]['mood'] = round((float) $fila['humor'], 4);
    $porBarrio[$b]['moodSubjects'] = (int) $fila['sujetos'];
}

$maxActividad = max(1, ...array_map(static fn (array $b): int => $b['activity'], $porBarrio));

$heat = [];
foreach ($porBarrio as $barrio => $datos) {
    $publicable = Telemetry::publishable($datos['subjects']);
    arsort($datos['votes']);
    $totalVotos = array_sum($datos['votes']);
    $ordenadas = array_keys($datos['votes']);
    $primero = $ordenadas[0] ?? null;
    $segundo = $ordenadas[1] ?? null;
    $margen = ($publicable && $totalVotos > 0 && $primero !== null)
        ? ($datos['votes'][$primero] - ($segundo !== null ? $datos['votes'][$segundo] : 0)) / $totalVotos
        : 0.0;

    $heat[] = [
        'barrio' => $barrio,
        // La facción 0 es "indeciso": no domina nada.
        'dominantFaction' => ($publicable && $primero !== null && $primero > 0) ? (int) $primero : null,
        'dominanceMargin' => round(max(0.0, min(1.0, $margen)), 4),
        'militancy' => $publicable ? round(min(1.0, $datos['activity'] / $maxActividad), 4) : 0.0,
        'mood' => $publicable ? $datos['mood'] : 0.0,
        'subjects' => $datos['subjects'],
        'publishable' => $publicable,
    ];
}

/* --- 2. Proyección electoral ---------------------------------------------- */

// El share se pondera por padrón de barrio: la muestra del juego sobre-
// representa al Centro, y sin ponderar el que gana en la plaza parece que gana
// el pueblo. Los pesos son los mismos de `BARRIO_DEFS` en /shared.
$pesos = [
    'centro' => 0.19, 'badenes' => 0.10, 'ceferino' => 0.11, 'bella_vista' => 0.09,
    'don_bosco' => 0.08, 'estacion' => 0.06, 'zona_norte' => 0.08, 'alta_esquel' => 0.07,
    'plan_1000' => 0.06, 'valle_chico' => 0.04, 'matadero' => 0.05, 'villa_ayelen' => 0.04,
    'alto_rio_percy' => 0.03, 'otro' => 0.0,
];

$facciones = [];
foreach ($porBarrio as $datos) {
    foreach (array_keys($datos['votes']) as $faccion) {
        if ((int) $faccion > 0) {
            $facciones[(int) $faccion] = true;
        }
    }
}

$sharePorFaccion = [];
$sujetosTotales = 0;
foreach (array_keys($facciones) as $faccion) {
    $numerador = 0.0;
    $pesoTotal = 0.0;
    $n = 0;
    foreach ($porBarrio as $barrio => $datos) {
        $peso = $pesos[$barrio] ?? 0.0;
        $total = array_sum($datos['votes']);
        if ($peso <= 0 || $total <= 0 || !Telemetry::publishable($datos['subjects'])) {
            continue;
        }
        $numerador += (($datos['votes'][$faccion] ?? 0) / $total) * $peso;
        $pesoTotal += $peso;
        $n += $datos['subjects'];
    }
    $sharePorFaccion[$faccion] = $pesoTotal > 0 ? $numerador / $pesoTotal : 0.0;
    $sujetosTotales = max($sujetosTotales, $n);
}

// El reparto de bancas vive en `Telemetry::dHondt()`: la misma cuenta que hace
// el motor del VPS en TypeScript, verificada por `npm run test:intelligence`.
$bancas = Telemetry::dHondt($sharePorFaccion);

// Variación contra el corte anterior: el mismo cálculo, corrido una ventana.
$anterior = Db::run(
    "SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.targetFaction')), '0') AS faccion,
            COUNT(DISTINCT sujeto) AS sujetos
       FROM telemetria_inteligencia
      WHERE nombre = 'vote_intent' AND dia < ? AND dia >= DATE_SUB(?, INTERVAL ? DAY)
      GROUP BY faccion",
    [$desde, $desde, $dias]
)->fetchAll();
$totalAnterior = array_sum(array_map(static fn (array $f): int => (int) $f['sujetos'], $anterior));
$sharesAnteriores = [];
foreach ($anterior as $fila) {
    $sharesAnteriores[(int) $fila['faccion']] = $totalAnterior > 0 ? (int) $fila['sujetos'] / $totalAnterior : 0.0;
}

$proyeccion = [];
foreach ($sharePorFaccion as $faccion => $share) {
    $proyeccion[] = [
        'factionId' => (int) $faccion,
        'share' => round($share, 5),
        'deltaPp' => round(($share - ($sharesAnteriores[$faccion] ?? $share)) * 100, 2),
        'moe' => Telemetry::marginOfError($share, max(1, $sujetosTotales)),
        'seats' => $bancas[$faccion] ?? 0,
        'n' => $sujetosTotales,
    ];
}
usort($proyeccion, static fn (array $a, array $b): int => $b['share'] <=> $a['share']);

$indecisos = 0;
$decididos = 0;
foreach ($porBarrio as $datos) {
    foreach ($datos['votes'] as $faccion => $n) {
        if ((int) $faccion === 0) {
            $indecisos += $n;
        } else {
            $decididos += $n;
        }
    }
}

/* --- 3. Tendencia diaria --------------------------------------------------- */

$tendencia = Db::run(
    "SELECT dia,
            COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.targetFaction')), '0') AS faccion,
            COUNT(DISTINCT sujeto) AS sujetos
       FROM telemetria_inteligencia
      WHERE nombre = 'vote_intent' AND dia >= ?
      GROUP BY dia, faccion
      ORDER BY dia ASC",
    [$desde]
)->fetchAll();

$serie = [];
foreach ($tendencia as $fila) {
    $dia = (string) $fila['dia'];
    $serie[$dia] ??= ['day' => $dia, 'byFaction' => [], 'undecided' => 0, 'total' => 0];
    $faccion = (int) $fila['faccion'];
    $n = (int) $fila['sujetos'];
    $serie[$dia]['total'] += $n;
    if ($faccion === 0) {
        $serie[$dia]['undecided'] += $n;
    } else {
        $serie[$dia]['byFaction'][$faccion] = $n;
    }
}
$trend = [];
foreach ($serie as $dia => $datos) {
    $total = max(1, $datos['total']);
    $publicable = Telemetry::publishable($datos['total']);
    $shares = [];
    foreach ($datos['byFaction'] as $faccion => $n) {
        $shares[$faccion] = $publicable ? round($n / $total, 5) : 0.0;
    }
    $trend[] = [
        'day' => $dia,
        'byFaction' => (object) $shares,
        'undecided' => $publicable ? round($datos['undecided'] / $total, 5) : 0.0,
    ];
}

/* --- 4. Participación en misiones ------------------------------------------ */

$misiones = Db::run(
    "SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.questType')) AS tipo,
            SUM(nombre = 'quest_start')  AS arrancadas,
            SUM(nombre = 'quest_finish') AS terminadas,
            AVG(CASE WHEN nombre = 'quest_finish' THEN JSON_EXTRACT(payload, '$.completion') END) AS completitud,
            COUNT(DISTINCT sujeto) AS sujetos
       FROM telemetria_inteligencia
      WHERE nombre IN ('quest_start','quest_finish') AND dia >= ?
      GROUP BY tipo",
    [$desde]
)->fetchAll();

$participation = [];
foreach ($misiones as $fila) {
    if ($fila['tipo'] === null) {
        continue;
    }
    $publicable = Telemetry::publishable((int) $fila['sujetos']);
    $participation[] = [
        'questType' => (string) $fila['tipo'],
        'starts' => (int) $fila['arrancadas'],
        'finishes' => (int) $fila['terminadas'],
        'completionAvg' => $publicable ? round((float) $fila['completitud'], 4) : 0.0,
    ];
}

/* --- 5. Comercios auspiciados ---------------------------------------------- */

$comercios = Db::run(
    "SELECT c.id, c.nombre_fantasia AS nombre,
            SUM(t.nombre = 'sponsor_impression') AS impresiones,
            SUM(t.nombre = 'sponsor_enter')      AS entradas,
            SUM(t.nombre = 'sponsor_buff_claim') AS buffs,
            SUM(t.nombre = 'sponsor_cta_click')  AS clicks,
            COUNT(DISTINCT t.sujeto)             AS sujetos
       FROM comercios_patrocinados c
       LEFT JOIN telemetria_inteligencia t
              ON t.dia >= ?
             AND t.nombre IN ('sponsor_impression','sponsor_enter','sponsor_buff_claim','sponsor_cta_click')
             AND JSON_EXTRACT(t.payload, '$.sponsorId') = c.id
      WHERE c.estado = 'activo'
      GROUP BY c.id, c.nombre_fantasia
      ORDER BY impresiones DESC",
    [$desde]
)->fetchAll();

$sponsors = [];
foreach ($comercios as $fila) {
    $sponsors[] = [
        'sponsorId' => (int) $fila['id'],
        'name' => (string) $fila['nombre'],
        'impressions' => (int) $fila['impresiones'],
        'uniqueSubjects' => (int) $fila['sujetos'],
        'entries' => (int) $fila['entradas'],
        'buffClaims' => (int) $fila['buffs'],
    ];
}

/* --- 6. Población en línea -------------------------------------------------- */

$online = Db::first(
    'SELECT COUNT(*) AS n FROM personajes
      WHERE ultimo_online_en > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE)'
);

$snapshot = [
    'day' => gmdate('Y-m-d'),
    'generatedAt' => gmdate('c'),
    'heat' => [
        'day' => gmdate('Y-m-d'),
        'generatedAt' => gmdate('c'),
        'barrios' => $heat,
        'windowDays' => $dias,
    ],
    'projection' => [
        'day' => gmdate('Y-m-d'),
        'generatedAt' => gmdate('c'),
        'mayor' => $proyeccion,
        'council' => $proyeccion,
        'undecidedShare' => ($indecisos + $decididos) > 0 ? round($indecisos / ($indecisos + $decididos), 5) : 0.0,
        'sampleSize' => $sujetosTotales,
        'publishable' => Telemetry::publishable($sujetosTotales),
    ],
    'trend' => $trend,
    'participation' => $participation,
    'sponsors' => $sponsors,
    'live' => ['online' => (int) ($online['n'] ?? 0), 'shards' => 1],
    'kAnonMin' => $k,
];

/* --- salida ---------------------------------------------------------------- */

if ($formato === 'csv') {
    // Un CSV plano con el mapa de calor: es lo que se lleva a una planilla.
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="esquel2027-calor-' . gmdate('Y-m-d') . '.csv"');
    $salida = fopen('php://output', 'w');
    fputcsv($salida, ['barrio', 'faccion_dominante', 'margen', 'militancia', 'humor', 'sujetos', 'publicable']);
    foreach ($heat as $fila) {
        fputcsv($salida, [
            $fila['barrio'],
            $fila['dominantFaction'] ?? '',
            $fila['dominanceMargin'],
            $fila['militancy'],
            $fila['mood'],
            $fila['subjects'],
            $fila['publishable'] ? '1' : '0',
        ]);
    }
    fclose($salida);
    exit;
}

Http::json($snapshot);
