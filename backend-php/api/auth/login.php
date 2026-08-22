<?php
/**
 * POST /api/auth/login.php — entrar con alias (o mail) y contraseña.
 *
 * Devuelve el JWT con el payload que espera el VPS:
 * `{ userId, characterId, alias, factionId, rankTier, barrio }` más los claims
 * estándar. Con eso el cliente abre el WebSocket contra Colyseus y ya está
 * caminando por Esquel.
 *
 * Freno anti-fuerza bruta: ocho intentos fallidos y la cuenta queda bloqueada
 * quince minutos.
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use Esquel\Config;
use Esquel\Db;
use Esquel\Http;
use Esquel\Jwt;

Http::cors();
Http::requireMethod('POST');

$body = Http::jsonBody();
$identifier = trim((string) ($body['identifier'] ?? $body['alias'] ?? ''));
$password = (string) ($body['password'] ?? '');

if ($identifier === '' || $password === '') {
    Http::error('CREDENCIALES_FALTANTES', 'Faltan el alias y la contraseña.', 422);
}

$normalizado = mb_strtolower($identifier);
$usuario = Db::first(
    'SELECT id, nick, password_hash, rol, estado, telemetria_consent, intentos_fallidos, bloqueado_hasta
       FROM usuarios
      WHERE (nick_normalizado = ? OR email_normalizado = ?)
        AND eliminado_en IS NULL',
    [$normalizado, $normalizado]
);

// Mensaje único para usuario inexistente y contraseña equivocada: no se le
// regala a nadie la lista de alias registrados.
$credencialesInvalidas = static function (): never {
    Http::error('CREDENCIALES_INVALIDAS', 'Alias o contraseña incorrectos.', 401);
};

if ($usuario === null) {
    // Se gasta el mismo tiempo que en un login real para no filtrar por timing.
    password_verify($password, '$argon2id$v=19$m=65536,t=4,p=1$YWFhYWFhYWFhYWFhYQ$0000000000000000000000000000000000000000000');
    $credencialesInvalidas();
}

if ($usuario['bloqueado_hasta'] !== null && strtotime((string) $usuario['bloqueado_hasta']) > time()) {
    Http::error('CUENTA_BLOQUEADA', 'Demasiados intentos. Esperá unos minutos y volvé a probar.', 429);
}

if (in_array($usuario['estado'], ['baneado', 'suspendido'], true)) {
    Http::error('CUENTA_SUSPENDIDA', 'Esta cuenta está suspendida. Escribinos si creés que es un error.', 403);
}

if (!password_verify($password, (string) $usuario['password_hash'])) {
    $intentos = (int) $usuario['intentos_fallidos'] + 1;
    $maxIntentos = (int) Config::get('security.max_login_attempts', 8);
    $bloqueo = (int) Config::get('security.lockout_minutes', 15);

    Db::run(
        'UPDATE usuarios
            SET intentos_fallidos = ?,
                bloqueado_hasta = CASE WHEN ? >= ? THEN DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE) ELSE bloqueado_hasta END
          WHERE id = ?',
        [$intentos, $intentos, $maxIntentos, $bloqueo, $usuario['id']]
    );
    $credencialesInvalidas();
}

// Rehash si el algoritmo cambió (por ejemplo, si sube el costo de Argon2).
if (password_needs_rehash((string) $usuario['password_hash'], PASSWORD_ARGON2ID)) {
    Db::run('UPDATE usuarios SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_ARGON2ID), $usuario['id']]);
}

$personaje = Db::first(
    'SELECT id, nombre, faccion_id, rango_nivel, barrio, xp, reputacion, guita_centavos, salud,
            pos_x, pos_y, pos_z
       FROM personajes
      WHERE usuario_id = ? AND estado = "activo"
      ORDER BY ultimo_online_en IS NULL, ultimo_online_en DESC, id ASC
      LIMIT 1',
    [$usuario['id']]
);

if ($personaje === null) {
    Http::error('SIN_PERSONAJE', 'La cuenta no tiene personaje. Volvé a hacer el registro rápido.', 409);
}

$ipHash = Http::ipHash();
Db::run(
    'UPDATE usuarios
        SET intentos_fallidos = 0, bloqueado_hasta = NULL,
            ultimo_login_en = UTC_TIMESTAMP(3), ultimo_ip_hash = ?
      WHERE id = ?',
    [$ipHash, $usuario['id']]
);

$secret = (string) Config::get('jwt.secret');
if ($secret === '') {
    Http::error('CONFIG_INCOMPLETA', 'Falta el secreto JWT en la configuración del servidor.', 500);
}

$ttl = (int) Config::get('jwt.access_ttl_seconds', 900);
$issuer = (string) Config::get('jwt.issuer');

$accessToken = Jwt::issueAccessToken([
    'userId' => (int) $usuario['id'],
    'characterId' => (int) $personaje['id'],
    'alias' => (string) $personaje['nombre'],
    'factionId' => (int) ($personaje['faccion_id'] ?? 0),
    'rankTier' => (int) $personaje['rango_nivel'],
    'barrio' => (string) $personaje['barrio'],
    'role' => (string) $usuario['rol'],
    'telemetryConsent' => (bool) $usuario['telemetria_consent'],
    'bind' => Http::bindFingerprint(),
], $secret, $issuer, $ttl);

$refresh = Jwt::issueRefreshToken((string) $usuario['id'], $secret, $issuer, (int) Config::get('jwt.refresh_ttl_seconds', 2592000));

Db::run(
    'INSERT INTO usuario_tokens (usuario_id, jti, token_hash, bind_hash, emitido_en, expira_en)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3), FROM_UNIXTIME(?))',
    [$usuario['id'], $refresh['jti'], hash('sha256', $refresh['token']), substr($ipHash, 0, 16), $refresh['expiresAt']]
);

Http::json([
    'accessToken' => $accessToken,
    'refreshToken' => $refresh['token'],
    'tokenType' => 'Bearer',
    'expiresIn' => $ttl,
    'realtimeEndpoint' => Config::get('realtime.endpoint'),
    'player' => [
        'userId' => (string) $usuario['id'],
        'characterId' => (string) $personaje['id'],
        'alias' => (string) $personaje['nombre'],
        'factionId' => (int) ($personaje['faccion_id'] ?? 0),
        'rankTier' => (int) $personaje['rango_nivel'],
        'barrio' => (string) $personaje['barrio'],
        'xp' => (int) $personaje['xp'],
        'reputacion' => (int) $personaje['reputacion'],
        'guitaCentavos' => (int) $personaje['guita_centavos'],
        'salud' => (int) $personaje['salud'],
        'ultimaPosicion' => [
            'x' => (float) $personaje['pos_x'],
            'y' => (float) $personaje['pos_y'],
            'z' => (float) $personaje['pos_z'],
        ],
    ],
]);
