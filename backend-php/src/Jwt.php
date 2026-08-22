<?php
/**
 * JWT HS256.
 *
 * Es el gemelo exacto de `server-vps/src/auth/jwt.ts`: mismo base64url, mismo
 * orden de campos en el header, misma comparación en tiempo constante. La prueba
 * `npm run test:jwt` firma acá y verifica allá (y al revés) para que no se puedan
 * separar nunca.
 *
 * Sin librería a propósito: son treinta líneas y la dependencia externa sólo
 * agregaría superficie de ataque y un `composer install` en Hostinger.
 */

declare(strict_types=1);

namespace Esquel;

final class Jwt
{
    public static function base64UrlEncode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $encoded): string
    {
        $padded = str_pad(strtr($encoded, '-_', '+/'), (int) (ceil(strlen($encoded) / 4) * 4), '=');

        return (string) base64_decode($padded, true);
    }

    /**
     * Firma un payload. El header va siempre igual: `{"alg":"HS256","typ":"JWT"}`.
     *
     * @param array<string, mixed> $claims
     */
    public static function encode(array $claims, string $secret): string
    {
        $header = self::base64UrlEncode((string) json_encode(
            ['alg' => 'HS256', 'typ' => 'JWT'],
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        ));
        $payload = self::base64UrlEncode((string) json_encode(
            $claims,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        ));
        $signature = self::base64UrlEncode(hash_hmac('sha256', $header . '.' . $payload, $secret, true));

        return $header . '.' . $payload . '.' . $signature;
    }

    /**
     * Verifica firma y vigencia.
     *
     * @return array{ok: true, claims: array<string, mixed>}|array{ok: false, reason: string}
     */
    public static function decode(string $token, string $secret, int $clockToleranceS = 60): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return ['ok' => false, 'reason' => 'FORMATO'];
        }

        [$headerB64, $payloadB64, $signatureB64] = $parts;

        $header = json_decode(self::base64UrlDecode($headerB64), true);
        $claims = json_decode(self::base64UrlDecode($payloadB64), true);
        if (!is_array($header) || !is_array($claims)) {
            return ['ok' => false, 'reason' => 'FORMATO'];
        }
        if (($header['alg'] ?? '') !== 'HS256') {
            return ['ok' => false, 'reason' => 'ALGORITMO'];
        }

        $expected = self::base64UrlEncode(hash_hmac('sha256', $headerB64 . '.' . $payloadB64, $secret, true));
        if (!hash_equals($expected, $signatureB64)) {
            return ['ok' => false, 'reason' => 'FIRMA'];
        }

        $now = time();
        if (!isset($claims['exp']) || ((int) $claims['exp'] + $clockToleranceS) < $now) {
            return ['ok' => false, 'reason' => 'EXPIRADO'];
        }
        if (isset($claims['nbf']) && ((int) $claims['nbf'] - $clockToleranceS) > $now) {
            return ['ok' => false, 'reason' => 'TODAVIA_NO_VALIDO'];
        }

        return ['ok' => true, 'claims' => $claims];
    }

    /**
     * Arma el access token del juego.
     *
     * El payload es el contrato de `/shared/types/auth.ts`: lo que el VPS necesita
     * para dejar entrar a alguien a la sala sin consultar MySQL.
     */
    public static function issueAccessToken(array $player, string $secret, string $issuer, int $ttl): string
    {
        $now = time();

        return self::encode([
            'iss' => $issuer,
            'aud' => ['esquel-api', 'esquel-realtime'],
            'sub' => (string) $player['userId'],
            'jti' => bin2hex(random_bytes(16)),
            'iat' => $now,
            'nbf' => $now - 5,
            'exp' => $now + $ttl,

            'nick' => $player['alias'],
            'role' => $player['role'] ?? 'player',
            'scopes' => ['game:play', 'game:voice', 'profile:read', 'profile:write', 'telemetry:write'],

            'userId' => (string) $player['userId'],
            'characterId' => (string) $player['characterId'],
            'alias' => $player['alias'],
            'factionId' => (int) $player['factionId'],
            'rankTier' => (int) $player['rankTier'],
            'barrio' => $player['barrio'],

            'mode' => 'ciudadano',
            'telemetryConsent' => (bool) ($player['telemetryConsent'] ?? true),
            'consentVersion' => 1,
            'bind' => substr(hash('sha256', ($player['bind'] ?? '') . $issuer), 0, 16),
        ], $secret);
    }

    /** Refresh token: mínimo y opaco para el cliente. */
    public static function issueRefreshToken(string $userId, string $secret, string $issuer, int $ttl, ?string $prev = null): array
    {
        $now = time();
        $jti = bin2hex(random_bytes(16));
        $claims = [
            'iss' => $issuer,
            'aud' => ['esquel-api'],
            'sub' => $userId,
            'jti' => $jti,
            'iat' => $now,
            'exp' => $now + $ttl,
        ];
        if ($prev !== null) {
            $claims['prev'] = $prev;
        }

        return ['token' => self::encode($claims, $secret), 'jti' => $jti, 'expiresAt' => $now + $ttl];
    }
}
