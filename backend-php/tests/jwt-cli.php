<?php
/**
 * CLI mínima para probar la paridad de JWT entre PHP y Node.
 *
 *   php backend-php/tests/jwt-cli.php issue <secreto> [alias] [userId] [faccion] [rango] [barrio] [xp] [rep] [lealtad]
 *   php backend-php/tests/jwt-cli.php verify <secreto> <token> → imprime el resultado en JSON
 *
 * La usa `npm run test:jwt`: PHP firma, Node verifica, y al revés. Si algún día
 * alguien cambia el orden de los campos del header o el padding del base64url,
 * la prueba se cae y nos enteramos en el momento, no en producción.
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Telemetry.php';
require_once __DIR__ . '/../src/Jwt.php';

use Esquel\Jwt;
use Esquel\Telemetry;

$command = $argv[1] ?? '';
$secret = $argv[2] ?? '';

if ($secret === '') {
    fwrite(STDERR, "Falta el secreto.\n");
    exit(2);
}

if ($command === 'issue') {
    // Opcionales: alias, userId, facción, rango y barrio. Sirve para mintear los
    // dos vecinos de la prueba de navegador sin levantar MySQL.
    echo Jwt::issueAccessToken([
        'userId' => (int) ($argv[4] ?? 4242),
        'characterId' => (int) ($argv[4] ?? 4242) * 2,
        'alias' => $argv[3] ?? 'Beto el Puntero',
        'factionId' => (int) ($argv[5] ?? 3),
        'rankTier' => (int) ($argv[6] ?? 4),
        'barrio' => $argv[7] ?? 'ceferino',
        // Progreso acumulado: sin esto la sala arranca en cero y no se puede
        // ejercitar el ascenso desde una prueba de navegador.
        'xp' => (int) ($argv[8] ?? 0),
        'reputation' => (int) ($argv[9] ?? 0),
        'loyalty' => (float) ($argv[10] ?? 0.2),
        'telemetryConsent' => true,
        'bind' => 'test',
        // El mismo seudónimo que mintearía el login real: sin esto, la sala
        // descarta la telemetría de los tokens de prueba y las pruebas de
        // navegador dejarían de ejercitar ese camino.
        'telemetrySubject' => Telemetry::subject((int) ($argv[4] ?? 4242)),
    ], $secret, 'https://esquel2027.ar', 900);
    exit(0);
}

if ($command === 'verify') {
    $token = $argv[3] ?? '';
    $result = Jwt::decode($token, $secret);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
    exit($result['ok'] === true ? 0 : 1);
}

fwrite(STDERR, "Uso: jwt-cli.php issue|verify <secreto> [token]\n");
exit(2);
