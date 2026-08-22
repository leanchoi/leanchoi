<?php
/**
 * Guardia del Dashboard de Campaña.
 *
 * Verifica el JWT del panel y comprueba que la sesión siga viva en
 * `admin_sesiones`. Las dos cosas: la firma dice que el token es nuestro, la
 * tabla dice que todavía vale. Sin la tabla no se podría revocar nada hasta que
 * venza solo.
 */

declare(strict_types=1);

namespace Esquel;

final class AdminAuth
{
    /**
     * Exige un token de administrador. Corta la request si no da.
     *
     * @return array<string, mixed> Claims del token.
     */
    public static function require(): array
    {
        $header = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if ($header === '' && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            $header = (string) ($headers['Authorization'] ?? $headers['authorization'] ?? '');
        }

        $token = str_starts_with($header, 'Bearer ') ? trim(substr($header, 7)) : '';
        if ($token === '') {
            Http::error('SIN_TOKEN', 'Falta el token de administrador.', 401);
        }

        $secret = (string) Config::get('jwt.secret');
        $resultado = Jwt::decode($token, $secret);
        if (($resultado['ok'] ?? false) !== true) {
            Http::error('TOKEN_INVALIDO', 'El token no es válido o venció: ' . ($resultado['reason'] ?? 'DESCONOCIDO'), 401);
        }
        /** @var array<string, mixed> $claims */
        $claims = $resultado['claims'];

        $rol = (string) ($claims['role'] ?? 'player');
        if (!in_array($rol, ['admin', 'moderator'], true)) {
            Http::error('SIN_PERMISO', 'Ese token no abre el panel.', 403);
        }

        // La sesión tiene que seguir viva: vencida o revocada, no entra.
        $sesion = Db::first(
            'SELECT id FROM admin_sesiones
              WHERE token_hash = ? AND revocado_en IS NULL AND expira_en > UTC_TIMESTAMP(3)',
            [hash('sha256', $token)]
        );
        if ($sesion === null) {
            Http::error('SESION_CERRADA', 'La sesión del panel ya no está vigente.', 401);
        }

        return $claims;
    }
}
