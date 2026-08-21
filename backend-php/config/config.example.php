<?php
/**
 * Esquel 2027 — configuración del backend (Hostinger).
 * Copiar a `local.php` y completar. `local.php` NO se versiona.
 */

declare(strict_types=1);

return [
    'env' => 'development', // development | staging | production
    'debug' => true,

    'db' => [
        'dsn' => 'mysql:host=localhost;dbname=esquel2027;charset=utf8mb4',
        'user' => '',
        'password' => '',
        'options' => [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ],
    ],

    'jwt' => [
        // Ed25519. Generar con: sodium_crypto_sign_keypair()
        'issuer' => 'https://esquel2027.ar',
        'audience' => ['esquel-api', 'esquel-realtime'],
        'kid' => 'esquel-2027-01',
        'private_key_base64' => '',
        'public_key_base64' => '',
        'access_ttl_seconds' => 900,      // 15 minutos
        'refresh_ttl_seconds' => 2592000, // 30 días
    ],

    'realtime' => [
        'endpoint' => 'wss://rt.esquel2027.ar',
        // Mismo secreto que API_INTERNAL_HMAC_SECRET en el VPS
        'internal_hmac_secret' => '',
        'allowed_ips' => ['127.0.0.1'],
    ],

    'telemetry' => [
        // Sal del seudónimo HMAC. Rota cada 30 días; la anterior se destruye.
        'pseudonym_salt' => '',
        'pseudonym_salt_rotated_at' => '2027-01-01',
        'k_anon_min' => 15,
        'raw_retention_days' => 180,
        'batch_max_events' => 50,
        'batch_max_bytes' => 65536,
    ],

    'security' => [
        // Sal para hashear IPs antes de guardarlas. La IP en claro no se persiste.
        'ip_hash_salt' => '',
        'password_algo' => PASSWORD_ARGON2ID,
        'max_login_attempts' => 8,
        'lockout_minutes' => 15,
    ],

    'uploads' => [
        'private_path' => __DIR__ . '/../../storage/private',
        'cdn_path' => __DIR__ . '/../public/cdn',
        'max_photo_bytes' => 5242880, // 5 MB
        'allowed_mime' => ['image/jpeg', 'image/png', 'image/webp'],
    ],
];
