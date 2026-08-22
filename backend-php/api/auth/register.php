<?php
/**
 * POST /api/auth/register.php — onboarding de menos de 30 segundos.
 *
 * Pide lo mínimo para empezar a caminar Esquel: alias, contraseña, edad, género,
 * barrio, facción y cuánto le interesa la política. Con eso crea la cuenta, el
 * perfil demográfico y el personaje, y devuelve el JWT listo para entrar a la
 * sala del VPS. Sin verificación de mail, sin captcha, sin pantalla de bienvenida
 * en cinco pasos.
 *
 * Cuerpo esperado:
 * {
 *   "alias": "Beto el Puntero",
 *   "password": "cheguevara2027",
 *   "edad": 34,
 *   "genero": "masculino",
 *   "barrio": "ceferino",
 *   "faccionId": 3,
 *   "interesPolitico": "alto",
 *   "email": "opcional@ejemplo.com",
 *   "telemetria": true
 * }
 */

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use Esquel\Config;
use Esquel\Db;
use Esquel\Http;
use Esquel\Jwt;
use Esquel\Validation;

Http::cors();
Http::requireMethod('POST');

$body = Http::jsonBody();

/* --- validación mínima ------------------------------------------------- */

$alias = Validation::alias((string) ($body['alias'] ?? ''));
if ($alias === null) {
    Http::error('ALIAS_INVALIDO', 'El alias va de 3 a 24 caracteres, sin símbolos raros.', 422, ['alias' => 'inválido']);
}

$password = (string) ($body['password'] ?? '');
if (!Validation::password($password)) {
    Http::error('PASSWORD_CORTA', 'La contraseña necesita al menos 8 caracteres.', 422, ['password' => 'corta']);
}

$edad = Validation::edad($body['edad'] ?? null);
if ($edad === null) {
    Http::error('EDAD_INVALIDA', 'Poné una edad real, entre 13 y 110.', 422, ['edad' => 'inválida']);
}

$genero = Validation::enOpciones($body['genero'] ?? null, Validation::GENEROS, 'prefiere_no_decir');
$barrio = Validation::enOpciones($body['barrio'] ?? null, Validation::BARRIOS, 'centro');
$interes = Validation::enOpciones($body['interesPolitico'] ?? null, Validation::INTERESES, 'medio');
$email = Validation::email($body['email'] ?? null);
$telemetria = (bool) ($body['telemetria'] ?? true);

$faccionId = isset($body['faccionId']) ? (int) $body['faccionId'] : 0;
if ($faccionId !== 0) {
    $faccion = Db::first('SELECT id FROM facciones WHERE id = ? AND activa = 1', [$faccionId]);
    if ($faccion === null) {
        Http::error('FACCION_INVALIDA', 'Esa facción no existe. Elegí otra o entrá como independiente.', 422);
    }
}

/* --- alta en una transacción ------------------------------------------- */

$aliasNormalizado = mb_strtolower($alias);

$existe = Db::first('SELECT id FROM usuarios WHERE nick_normalizado = ?', [$aliasNormalizado]);
if ($existe !== null) {
    Http::error('ALIAS_TOMADO', "Ese alias ya lo usa alguien en Esquel. Probá con otro.", 409, ['alias' => 'tomado']);
}

if ($email !== null) {
    $emailExiste = Db::first('SELECT id FROM usuarios WHERE email_normalizado = ?', [$email]);
    if ($emailExiste !== null) {
        Http::error('EMAIL_TOMADO', 'Ese mail ya está registrado. Entrá con tu cuenta.', 409, ['email' => 'tomado']);
    }
}

$hash = password_hash($password, PASSWORD_ARGON2ID);
$ipHash = Http::ipHash();

[$userId, $characterId] = Db::transaction(static function () use (
    $alias, $aliasNormalizado, $email, $hash, $edad, $genero, $barrio, $interes, $telemetria, $faccionId, $ipHash
): array {
    Db::run(
        'INSERT INTO usuarios
            (email, email_normalizado, password_hash, nick, nick_normalizado, rol, estado,
             telemetria_consent, consent_version, tyc_version, ultimo_ip_hash, ultimo_login_en)
         VALUES (?, ?, ?, ?, ?, "player", "activo", ?, 1, 1, ?, UTC_TIMESTAMP(3))',
        [$email, $email, $hash, $alias, $aliasNormalizado, $telemetria ? 1 : 0, $ipHash]
    );
    $userId = (int) Db::pdo()->lastInsertId();

    Db::run(
        'INSERT INTO perfiles_demograficos
            (usuario_id, edad, genero, barrio, interes_politico, onboarding_completado_en, fuente_registro)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), "onboarding_rapido")',
        [$userId, $edad, $genero, $barrio, $interes]
    );

    Db::run(
        'INSERT INTO personajes
            (usuario_id, nombre, nombre_normalizado, faccion_id, rango_nivel, barrio, modo, faccion_desde)
         VALUES (?, ?, ?, ?, 1, ?, "ciudadano", UTC_TIMESTAMP(3))',
        [$userId, $alias, $aliasNormalizado, $faccionId !== 0 ? $faccionId : null, $barrio]
    );
    $characterId = (int) Db::pdo()->lastInsertId();

    Db::run(
        'INSERT INTO consentimientos (usuario_id, tipo, version, otorgado, ip_hash)
         VALUES (?, "tyc", 1, 1, ?), (?, "telemetria", 1, ?, ?)',
        [$userId, $ipHash, $userId, $telemetria ? 1 : 0, $ipHash]
    );

    if ($faccionId !== 0) {
        Db::run('UPDATE facciones SET miembros = miembros + 1 WHERE id = ?', [$faccionId]);
    }

    return [$userId, $characterId];
});

/* --- token y respuesta -------------------------------------------------- */

$secret = (string) Config::get('jwt.secret');
if ($secret === '') {
    Http::error('CONFIG_INCOMPLETA', 'Falta el secreto JWT en la configuración del servidor.', 500);
}

$ttl = (int) Config::get('jwt.access_ttl_seconds', 900);
$issuer = (string) Config::get('jwt.issuer');

$accessToken = Jwt::issueAccessToken([
    'userId' => $userId,
    'characterId' => $characterId,
    'alias' => $alias,
    'factionId' => $faccionId,
    'rankTier' => 1,
    'barrio' => $barrio,
    'telemetryConsent' => $telemetria,
    'bind' => Http::bindFingerprint(),
], $secret, $issuer, $ttl);

$refresh = Jwt::issueRefreshToken(
    (string) $userId,
    $secret,
    $issuer,
    (int) Config::get('jwt.refresh_ttl_seconds', 2592000)
);

Db::run(
    'INSERT INTO usuario_tokens (usuario_id, jti, token_hash, bind_hash, emitido_en, expira_en)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3), FROM_UNIXTIME(?))',
    [$userId, $refresh['jti'], hash('sha256', $refresh['token']), substr($ipHash, 0, 16), $refresh['expiresAt']]
);

Http::json([
    'accessToken' => $accessToken,
    'refreshToken' => $refresh['token'],
    'tokenType' => 'Bearer',
    'expiresIn' => $ttl,
    'realtimeEndpoint' => Config::get('realtime.endpoint'),
    'player' => [
        'userId' => (string) $userId,
        'characterId' => (string) $characterId,
        'alias' => $alias,
        'factionId' => $faccionId,
        'rankTier' => 1,
        'barrio' => $barrio,
    ],
    'bienvenida' => "Bienvenido a Esquel, $alias. Andá a la Plaza San Martín que ahí se arma.",
], 201);
