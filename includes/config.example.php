<?php
/**
 * Copiar este archivo a includes/config.php y completar con los datos
 * reales de la base de datos MySQL creada en hPanel (Hostinger).
 *
 * includes/config.php NO se sube al repositorio (ver .gitignore).
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'u000000000_esquellab');
define('DB_USER', 'u000000000_esquellab');
define('DB_PASS', 'CAMBIAR_ESTA_CLAVE');
define('DB_CHARSET', 'utf8mb4');

// Nombre público del sitio, usado en <title> y en el media kit.
define('SITE_NAME', 'Esquel LAB');

// Fechas clave del programa (formato Y-m-d H:i:s, hora local de Esquel).
define('FECHA_APERTURA_CONVOCATORIA', '2026-07-23 00:00:00');
define('FECHA_CIERRE_CONVOCATORIA', '2026-08-09 23:59:59');
define('FECHA_INICIO_TRABAJO_TECNICO', '2026-08-10 00:00:00');
define('FECHA_CIERRE_COHORTE', '2026-10-02 00:00:00');

// Si es true, el formulario deja de aceptar envíos automáticamente
// después de FECHA_CIERRE_CONVOCATORIA. Ver docs/00-investigacion-y-plan.md §2.4.
define('CIERRE_AUTOMATICO_FORMULARIO', true);

// Zona horaria del programa.
date_default_timezone_set('America/Argentina/Buenos_Aires');
