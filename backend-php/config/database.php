<?php
/**
 * Configuración de base de datos para Hostinger.
 *
 * Este archivo es la **única** fuente de los datos de conexión. `Esquel\Config`
 * lo lee y `Esquel\Db` abre el PDO con lo que salga de acá, así que cambiar de
 * servidor o de base se hace en un solo lugar.
 *
 * En el panel de Hostinger, los datos salen de *Bases de datos → MySQL*:
 *
 *   DB_HOST   suele ser `localhost` (la base vive en el mismo hosting)
 *   DB_NAME   tiene el prefijo de la cuenta: `u123456789_esquel2027`
 *   DB_USER   idem: `u123456789_esquel`
 *   DB_PASS   la que se generó al crear el usuario
 *
 * Se pueden pasar por variables de entorno (recomendado) o escribir directo en
 * el array de abajo. Si están las dos cosas, gana la variable de entorno: así el
 * mismo archivo sirve en desarrollo y en producción sin editarlo.
 *
 * IMPORTANTE: este archivo **no** va al repositorio con credenciales adentro.
 * El `.gitignore` ya lo cubre; lo que se versiona es `config.example.php`.
 */

declare(strict_types=1);

/** Lee una variable de entorno con valor por defecto. */
$env = static function (string $clave, string $porDefecto = ''): string {
    $valor = getenv($clave);
    if ($valor === false || $valor === '') {
        $valor = $_ENV[$clave] ?? $_SERVER[$clave] ?? '';
    }
    return $valor === '' ? $porDefecto : (string) $valor;
};

$host = $env('DB_HOST', 'localhost');
$puerto = $env('DB_PORT', '3306');
$base = $env('DB_NAME', 'esquel2027');
$socket = $env('DB_SOCKET', '');

// El charset va en el DSN, no en un `SET NAMES` posterior: así la conexión nace
// en utf8mb4 y no hay una ventana donde los acentos viajen mal.
$dsn = $socket !== ''
    ? sprintf('mysql:unix_socket=%s;dbname=%s;charset=utf8mb4', $socket, $base)
    : sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $host, $puerto, $base);

return [
    'dsn' => $env('DB_DSN', $dsn),
    'user' => $env('DB_USER', ''),
    'password' => $env('DB_PASSWORD', $env('DB_PASS', '')),

    /**
     * Opciones del PDO. Las tres primeras no son negociables:
     *  · ERRMODE_EXCEPTION  — un error de SQL tiene que explotar, no devolver false.
     *  · FETCH_ASSOC        — nadie quiere las columnas duplicadas por índice.
     *  · EMULATE_PREPARES=false — los prepares van de verdad al servidor, que es
     *    lo que hace que los parámetros sean parámetros y no concatenación.
     */
    'options' => [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
        // Hostinger cierra conexiones ociosas: no se persisten.
        PDO::ATTR_PERSISTENT => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00', sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION'",
    ],

    /**
     * Reintentos al abrir la conexión. En hosting compartido pasa que la primera
     * conexión del minuto rebota con "too many connections"; un reintento corto
     * resuelve el 95% de esos casos sin que el jugador se entere.
     */
    'connect_retries' => (int) $env('DB_CONNECT_RETRIES', '2'),
    'connect_retry_ms' => (int) $env('DB_CONNECT_RETRY_MS', '120'),
];
