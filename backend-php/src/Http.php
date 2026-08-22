<?php
/**
 * Utilidades HTTP: CORS, cuerpo JSON, respuestas y errores.
 *
 * Todos los endpoints responden con la misma forma, que es el contrato
 * `ApiError` de `/shared/types/common.ts`. El cliente 3D no tiene que adivinar
 * nada.
 */

declare(strict_types=1);

namespace Esquel;

final class Http
{
    /** Aplica CORS y responde el preflight. */
    public static function cors(array $methods = ['POST', 'OPTIONS']): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowed = (array) Config::get('cors', []);

        if ($origin !== '' && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
        }
        header('Access-Control-Allow-Methods: ' . implode(',', $methods));
        header('Access-Control-Allow-Headers: content-type,authorization,x-esquel-signature,x-esquel-shard');
        header('Access-Control-Max-Age: 600');

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    public static function requireMethod(string $method): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== $method) {
            self::error('METHOD_NOT_ALLOWED', "Este endpoint responde sólo a $method.", 405);
        }
    }

    /** Cuerpo crudo, tal como llegó (hace falta para verificar la firma HMAC). */
    public static function rawBody(): string
    {
        return (string) file_get_contents('php://input');
    }

    /** @return array<string, mixed> */
    public static function jsonBody(): array
    {
        $raw = self::rawBody();
        if ($raw === '') {
            return [];
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            self::error('INVALID_JSON', 'El cuerpo de la petición no es JSON válido.', 400);
        }

        return $data;
    }

    public static function json(array $payload, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** @param array<string, string> $fields */
    public static function error(string $code, string $message, int $status = 400, array $fields = []): never
    {
        $payload = ['code' => $code, 'message' => $message, 'httpStatus' => $status];
        if ($fields !== []) {
            $payload['fields'] = $fields;
        }
        self::json($payload, $status);
    }

    /** Hash de la IP: nunca se guarda en claro. */
    public static function ipHash(): string
    {
        $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
        $ip = trim(explode(',', (string) $ip)[0]);

        return hash('sha256', $ip . (string) Config::get('security.ip_hash_salt'));
    }

    /** Huella del dispositivo para el claim `bind` del JWT. */
    public static function bindFingerprint(): string
    {
        return ($_SERVER['HTTP_USER_AGENT'] ?? '') . '|' . self::ipHash();
    }
}
