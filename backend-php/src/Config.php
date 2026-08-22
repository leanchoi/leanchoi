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

        $config['db'] ??= [];
        $config['db']['dsn'] ??= $env('DB_DSN', 'mysql:host=localhost;dbname=esquel2027;charset=utf8mb4');
        $config['db']['user'] ??= $env('DB_USER', '');
        $config['db']['password'] ??= $env('DB_PASSWORD', '');

        $config['jwt'] ??= [];
        $config['jwt']['secret'] ??= $env('JWT_SECRET', '');
        $config['jwt']['issuer'] ??= $env('JWT_ISSUER', 'https://esquel2027.ar');
        $config['jwt']['access_ttl_seconds'] ??= (int) ($env('JWT_ACCESS_TTL', '900'));
        $config['jwt']['refresh_ttl_seconds'] ??= (int) ($env('JWT_REFRESH_TTL', '2592000'));

        $config['realtime'] ??= [];
        $config['realtime']['endpoint'] ??= $env('REALTIME_URL', 'wss://rt.esquel2027.ar');
        $config['realtime']['internal_hmac_secret'] ??= $env('HOSTINGER_API_KEY', '');

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
