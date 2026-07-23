<?php
require_once __DIR__ . '/../includes/bootstrap.php';

requiere_rol('viewer');

$filtros = filtros_postulaciones_desde_get();
$postulaciones = buscar_postulaciones($filtros);

$columnas = [
    'id' => 'ID',
    'creado_en' => 'Fecha',
    'programa' => 'Programa',
    'estado' => 'Estado',
    'nombre_contacto' => 'Nombre',
    'email' => 'Email',
    'telefono' => 'Teléfono',
    'nombre_emprendimiento' => 'Emprendimiento',
    'tipo_figura' => 'Tipo de figura',
    'rubro' => 'Rubro',
    'anios_operando' => 'Tiempo operando',
    'redes_sociales' => 'Redes sociales',
    'ubicacion' => 'Ubicación',
    'cuit_dni' => 'CUIT/DNI',
    'propuesta_actual' => 'Propuesta',
    'diferenciacion' => 'Diferenciación',
    'matriz_turistica' => 'Matriz turística',
    'tiene_producto_fisico' => 'Tiene producto físico',
    'producto_fisico' => 'Producto físico (detalle)',
    'recursos_actuales' => 'Recursos actuales',
    'que_necesita' => 'Qué necesita',
    'motivacion' => 'Motivación',
    'equipo_participante' => 'Equipo participante',
    'material_apoyo_url' => 'Material de apoyo',
];

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="postulaciones-esquellab-' . date('Y-m-d') . '.csv"');

$salida = fopen('php://output', 'w');
fwrite($salida, "\xEF\xBB\xBF"); // BOM para que Excel reconozca UTF-8
fputcsv($salida, array_values($columnas));

foreach ($postulaciones as $p) {
    $fila = [];
    foreach (array_keys($columnas) as $campo) {
        $valor = $p[$campo] ?? '';
        if ($campo === 'programa') {
            $valor = nombre_programa($valor);
        } elseif ($campo === 'estado') {
            $valor = estado_info($valor)['label'];
        } elseif ($campo === 'creado_en') {
            $valor = fecha_legible($valor, true);
        } elseif ($campo === 'tiene_producto_fisico') {
            $valor = $valor === null || $valor === '' ? '' : ($valor ? 'Sí' : 'No');
        }
        $fila[] = $valor;
    }
    fputcsv($salida, $fila);
}

fclose($salida);
