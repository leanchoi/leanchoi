<?php
/**
 * Arranque común de la API.
 *
 * Autoload PSR-4 mínimo (sin Composer: en Hostinger compartido, cuanto menos
 * dependencias, menos cosas que se rompen), manejo de errores en JSON y zona
 * horaria en UTC.
 */

declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'Esquel\\')) {
        return;
    }
    $relative = str_replace('\\', '/', substr($class, strlen('Esquel\\')));
    $file = __DIR__ . '/../src/' . $relative . '.php';
    if (is_file($file)) {
        require_once $file;
    }
});

date_default_timezone_set('UTC');
mb_internal_encoding('UTF-8');

use Esquel\Config;
use Esquel\Http;

// Nada de warnings de PHP mezclados con el JSON de respuesta.
ini_set('display_errors', Config::get('debug') === true ? '1' : '0');
error_reporting(E_ALL);

set_exception_handler(static function (\Throwable $e): void {
    error_log('[esquel] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $debug = Config::get('debug') === true;
    Http::error(
        'INTERNAL_ERROR',
        $debug ? $e->getMessage() : 'Se rompió algo de nuestro lado. Probá de nuevo en un rato.',
        500
    );
});
