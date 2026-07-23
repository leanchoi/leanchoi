<?php
/**
 * Utilidades compartidas por todo el sitio.
 */

function e(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8');
}

function redirect(string $path): void
{
    header('Location: ' . $path);
    exit;
}

function base_url(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host;
}

function fecha_legible(string $mysqlDatetime, bool $conHora = false): string
{
    $meses = [1 => 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    $ts = strtotime($mysqlDatetime);
    $dia = (int) date('j', $ts);
    $mes = $meses[(int) date('n', $ts)];
    $anio = date('Y', $ts);
    $out = "{$dia} {$mes} {$anio}";
    if ($conHora) {
        $out .= ' · ' . date('H:i', $ts);
    }
    return $out;
}

/** Segundos restantes hasta una fecha MySQL; 0 si ya pasó. */
function segundos_hasta(string $mysqlDatetime): int
{
    $diff = strtotime($mysqlDatetime) - time();
    return max(0, $diff);
}

function convocatoria_abierta(): bool
{
    if (!CIERRE_AUTOMATICO_FORMULARIO) {
        return true;
    }
    $ahora = time();
    return $ahora >= strtotime(FECHA_APERTURA_CONVOCATORIA) && $ahora <= strtotime(FECHA_CIERRE_CONVOCATORIA);
}

const PROGRAMAS = [
    'acelera' => [
        'nombre'  => 'Esquel Acelera',
        'foco'    => 'Emprendedores urbanos, organizaciones y empresas de servicios turísticos',
        'cupo'    => '8 a 10 experiencias',
    ],
    'raiz' => [
        'nombre'  => 'Raíz',
        'foco'    => 'Productores y prestadores turísticos rurales',
        'cupo'    => '5 a 8 experiencias',
    ],
];

const ESTADOS = [
    'nueva'          => ['label' => 'Nueva',          'color' => '#6B7280'],
    'en_revision'    => ['label' => 'En revisión',    'color' => '#B7791F'],
    'preseleccionada'=> ['label' => 'Preseleccionada', 'color' => '#8C2A56'],
    'entrevista'     => ['label' => 'Entrevista',      'color' => '#1E63C7'],
    'aprobada'       => ['label' => 'Aprobada',        'color' => '#2F7A4F'],
    'lista_espera'   => ['label' => 'Lista de espera', 'color' => '#946200'],
    'rechazada'      => ['label' => 'No seleccionada', 'color' => '#9B2C2C'],
];

function nombre_programa(string $slug): string
{
    return PROGRAMAS[$slug]['nombre'] ?? ucfirst($slug);
}

function estado_info(string $slug): array
{
    return ESTADOS[$slug] ?? ['label' => ucfirst($slug), 'color' => '#6B7280'];
}

function filtros_postulaciones_desde_get(): array
{
    return [
        'programa' => $_GET['programa'] ?? '',
        'estado'   => $_GET['estado'] ?? '',
        'q'        => trim((string) ($_GET['q'] ?? '')),
    ];
}

/** Arma y ejecuta la búsqueda de postulaciones para list/tarjetas/exportar, con los mismos filtros. */
function buscar_postulaciones(array $filtros): array
{
    $sql = 'SELECT * FROM postulaciones WHERE 1=1';
    $params = [];

    if (!empty($filtros['programa']) && array_key_exists($filtros['programa'], PROGRAMAS)) {
        $sql .= ' AND programa = :programa';
        $params['programa'] = $filtros['programa'];
    }
    if (!empty($filtros['estado']) && array_key_exists($filtros['estado'], ESTADOS)) {
        $sql .= ' AND estado = :estado';
        $params['estado'] = $filtros['estado'];
    }
    if (!empty($filtros['q'])) {
        $sql .= ' AND (nombre_contacto LIKE :q OR nombre_emprendimiento LIKE :q OR email LIKE :q OR rubro LIKE :q)';
        $params['q'] = '%' . $filtros['q'] . '%';
    }
    $sql .= ' ORDER BY creado_en DESC';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}
