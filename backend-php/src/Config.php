<?php
/**
 * Configuración del backend.
 *
 * Lee `config/local.php` (no versionado) y, si no está, cae a variables de
 * entorno. En Hostinger lo normal es el archivo; en local, el .env del shell.
 */

declare(strict_types=1);

namespace Esquel;

final class Config
{
    /** @var array<string, mixed>|null */
    private static ?array $data = null;

    /** @return array<string, mixed> */
    public static function all(): array
    {
        if (self::$data !== null) {
            return self::$data;
        }

        $file = __DIR__ . '/../config/local.php';
        $config = is_file($file) ? require $file : [];

        // Las variables de entorno pisan al archivo: útil para probar sin tocar nada.
        $env = static fn (string $key, ?string $default = null): ?string
            => ($_ENV[$key] ?? getenv($key) ?: null) ?? $default;

        $config['env'] ??= $env('APP_ENV', 'production');
        $config['debug'] ??= $env('APP_DEBUG') === 'true';

        // La conexión sale de `config/database.php`, que es el único lugar donde
        // viven los datos de la base. Lo que ya venga en `local.php` gana.
        $dbFile = __DIR__ . '/../config/database.php';
        $dbDefaults = is_file($dbFile) ? require $dbFile : [];
        $config['db'] = array_merge($dbDefaults, $config['db'] ?? []);

        $config['jwt'] ??= [];
        $config['jwt']['secret'] ??= $env('JWT_SECRET', '');
        $config['jwt']['issuer'] ??= $env('JWT_ISSUER', 'https://esquel2027.ar');
        $config['jwt']['access_ttl_seconds'] ??= (int) ($env('JWT_ACCESS_TTL', '900'));
        $config['jwt']['refresh_ttl_seconds'] ??= (int) ($env('JWT_REFRESH_TTL', '2592000'));

        $config['realtime'] ??= [];
        $config['realtime']['endpoint'] ??= $env('REALTIME_URL', 'wss://rt.esquel2027.ar');
        $config['realtime']['internal_hmac_secret'] ??= $env('HOSTINGER_API_KEY', '');

        $config['telemetry'] ??= [];
        $config['telemetry']['pseudonym_salt'] ??= $env('TELEMETRY_SALT', '');
        $config['telemetry']['k_anon_min'] ??= (int) ($env('K_ANON_MIN', '15'));
        $config['telemetry']['raw_retention_days'] ??= (int) ($env('TELEMETRY_RETENTION_DAYS', '180'));
        $config['telemetry']['batch_max_events'] ??= (int) ($env('TELEMETRY_BATCH_MAX', '200'));

        $config['admin'] ??= [];
        // Clave maestra del dashboard. Vacía = el panel sólo se abre con una
        // cuenta de rol admin; es lo recomendado en producción.
        $config['admin']['master_password_hash'] ??= $env('ADMIN_MASTER_HASH', '');
        $config['admin']['session_ttl_seconds'] ??= (int) ($env('ADMIN_TTL', '28800'));

        $config['security'] ??= [];
        $config['security']['ip_hash_salt'] ??= $env('IP_HASH_SALT', 'esquel-sal-por-defecto');
        $config['security']['max_login_attempts'] ??= 8;
        $config['security']['lockout_minutes'] ??= 15;

        $config['cors'] ??= array_filter(explode(',', (string) $env(
            'CORS_ORIGIN',
            'http://localhost:5173,http://localhost:4173,https://esquel2027.ar'
        )));

        self::$data = $config;

        return self::$data;
    }

    public static function get(string $path, mixed $default = null): mixed
    {
        $value = self::all();
        foreach (explode('.', $path) as $segment) {
            if (!is_array($value) || !array_key_exists($segment, $value)) {
                return $default;
            }
            $value = $value[$segment];
        }

        return $value;
    }

    /** Sólo para tests: inyecta configuración sin tocar el disco. */
    public static function override(array $data): void
    {
        self::$data = $data;
    }
}
