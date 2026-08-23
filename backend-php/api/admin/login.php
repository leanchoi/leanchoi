<?php
/**
 * POST /api/admin/login.php — puerta del Dashboard de Campaña.
 *
 * Dos maneras de entrar, en este orden de preferencia:
 *
 *  1. **Cuenta con rol.** Alias y contraseña de un usuario con `rol` admin o
 *    moderador. Es lo recomendado: queda registro de quién entró y se le puede
 *    sacar el rol sin tocar la configuración del servidor.
 *  2. **Clave maestra.** Un hash Argon2id en la configuración
 *    (`admin.master_password_hash`). Sirve para el primer arranque y para
 *    cuando no hay cuentas todavía. Si el hash está vacío, esta vía no existe.
 *
 * El token que devuelve es el mismo JWT HS256 del juego, con `role: admin`: el
 * VPS lo verifica con el secreto compartido y abre `/intel/live` y
 * `/intel/liveops`. Un solo emisor de identidad en todo el sistema.
 *
 * La sesión queda anotada en `admin_sesiones` con el **hash** del token, no el
 * token: si alguien se lleva la base, no se lleva el acceso. Y se puede revocar
 * de a una sin invalidar todas.
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use Esquel\Config;
use Esquel\Db;
use Esquel\Http;
use Esquel\Jwt;

Http::cors(['POST', 'OPTIONS']);
Http::requireMethod('POST');

$body = Http::jsonBody();
$identifier = trim((string) ($body['identifier'] ?? ''));
$password = (string) ($body['password'] ?? '');
$masterPassword = (string) ($body['masterPassword'] ?? '');

$secret = (string) Config::get('jwt.secret');
$issuer = (string) Config::get('jwt.issuer');
if ($secret === '') {
    Http::error('CONFIG_INCOMPLETA', 'Falta el secreto JWT.', 500);
}

$ttl = max(900, (int) Config::get('admin.session_ttl_seconds', 28800));

/* --- freno anti-fuerza bruta --------------------------------------------- */

/**
 * El panel es el blanco más valioso del sistema: abre todo el dataset de
 * inteligencia y la consola de Live-Ops. La puerta del jugador tiene freno desde
 * la Fase 2 y ésta no tenía ninguno, que es exactamente al revés de como debería
 * ser.
 *
 * El freno cuenta intentos fallidos por IP —hasheada, nunca en claro— sobre la
 * misma tabla de sesiones. La vía de clave maestra es la más expuesta porque no
 * necesita adivinar un usuario: un solo secreto y a martillar.
 */
$ipHash = Http::ipHash();
$ventanaMinutos = 15;
$topeIntentos = 6;

// Se cuentan sólo las filas marcadas como intento fallido, no cualquier sesión
// revocada: si contara esas, un administrador que cierra sesión seis veces en
// quince minutos se dejaría afuera él mismo.
$fallidos = Db::first(
    "SELECT COUNT(*) AS n FROM admin_sesiones
      WHERE ip_hash = ? AND alias = 'intento-fallido'
        AND emitido_en > DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)",
    [$ipHash, $ventanaMinutos]
);

if ((int) ($fallidos['n'] ?? 0) >= $topeIntentos) {
    Http::error(
        'DEMASIADOS_INTENTOS',
        "Demasiados intentos fallidos. Probá de nuevo en $ventanaMinutos minutos.",
        429
    );
}

/**
 * Mensaje único para todos los fallos: no se le regala a nadie la información
 * de si el alias existe, si tiene rol o si la clave maestra está configurada.
 *
 * El intento fallido se anota como una sesión ya revocada: no sirve para entrar
 * y sirve para contar. Así el freno no necesita una tabla más.
 */
$rechazar = static function () use ($ipHash): never {
    Db::run(
        'INSERT INTO admin_sesiones (usuario_id, token_hash, alias, emitido_en, expira_en, revocado_en, ip_hash)
         VALUES (NULL, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), ?)',
        [hash('sha256', 'fallido:' . random_bytes(16)), 'intento-fallido', $ipHash]
    );
    // Se gasta el mismo tiempo en todos los caminos: no se filtra por timing
    // cuál de las dos vías existe.
    usleep(random_int(120_000, 220_000));
    Http::error('ACCESO_DENEGADO', 'No se pudo abrir el panel con esos datos.', 401);
};

$usuarioId = null;
$alias = 'admin';
$rol = 'admin';

if ($identifier !== '' && $password !== '') {
    $normalizado = mb_strtolower($identifier);
    $usuario = Db::first(
        'SELECT id, nick, password_hash, rol, estado
           FROM usuarios
          WHERE (nick_normalizado = ? OR email_normalizado = ?) AND eliminado_en IS NULL',
        [$normalizado, $normalizado]
    );

    if ($usuario === null) {
        // Se gasta el mismo tiempo que en un login real: no se filtra por timing.
        password_verify($password, '$argon2id$v=19$m=65536,t=4,p=1$YWFhYWFhYWFhYWFhYQ$0000000000000000000000000000000000000000000');
        $rechazar();
    }
    if (!password_verify($password, (string) $usuario['password_hash'])) {
        $rechazar();
    }
    if ((string) $usuario['estado'] !== 'activo') {
        $rechazar();
    }
    if (!in_array((string) $usuario['rol'], ['admin', 'moderator'], true)) {
        $rechazar();
    }

    $usuarioId = (int) $usuario['id'];
    $alias = (string) $usuario['nick'];
    $rol = (string) $usuario['rol'];
} elseif ($masterPassword !== '') {
    $hash = (string) Config::get('admin.master_password_hash', '');
    if ($hash === '' || !password_verify($masterPassword, $hash)) {
        $rechazar();
    }
} else {
    $rechazar();
}

/* --- token --------------------------------------------------------------- */

$token = Jwt::issueAccessToken([
    'userId' => $usuarioId ?? 0,
    'characterId' => 0,
    'alias' => $alias,
    'factionId' => 0,
    'rankTier' => 10,
    'barrio' => 'centro',
    'role' => $rol,
    'telemetryConsent' => false,
    'bind' => Http::bindFingerprint(),
], $secret, $issuer, $ttl);

Db::run(
    'INSERT INTO admin_sesiones (usuario_id, token_hash, alias, emitido_en, expira_en, ip_hash)
     VALUES (?, ?, ?, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? SECOND), ?)',
    [$usuarioId, hash('sha256', $token), $alias, $ttl, $ipHash]
);

// Entrar bien limpia el contador: al que sabe la clave no se lo sigue frenando.
Db::run("DELETE FROM admin_sesiones WHERE ip_hash = ? AND alias = 'intento-fallido'", [$ipHash]);

// Higiene: las sesiones vencidas hace más de una semana no aportan nada.
Db::run('DELETE FROM admin_sesiones WHERE expira_en < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 7 DAY)');

Http::json([
    'ok' => true,
    'token' => $token,
    'tokenType' => 'Bearer',
    'expiresIn' => $ttl,
    'alias' => $alias,
    'role' => $rol,
    'realtimeEndpoint' => Config::get('realtime.endpoint'),
]);
