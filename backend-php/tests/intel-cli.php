<?php
/**
 * CLI de paridad del Motor de Inteligencia.
 *
 * Lo usa `tools/ci/test-intelligence.ts` para comparar las cuentas de PHP con
 * las de TypeScript. Sin base de datos: sólo las funciones puras.
 *
 * Uso:
 *   php tests/intel-cli.php dhondt '{"1":0.34,"2":0.29,"3":0.21,"4":0.16}' 11 0.03
 *   php tests/intel-cli.php moe 0.5 100
 *   php tests/intel-cli.php agegroup 35-49
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/Telemetry.php';

use Esquel\Telemetry;

$comando = $argv[1] ?? '';

switch ($comando) {
    case 'dhondt': {
        $shares = json_decode((string) ($argv[2] ?? '{}'), true);
        if (!is_array($shares)) {
            fwrite(STDERR, "shares inválidos\n");
            exit(1);
        }
        $bancas = (int) ($argv[3] ?? 11);
        $piso = (float) ($argv[4] ?? 0.03);
        $normalizados = [];
        foreach ($shares as $id => $v) {
            $normalizados[(int) $id] = (float) $v;
        }
        echo json_encode(Telemetry::dHondt($normalizados, $bancas, $piso)), "\n";
        break;
    }

    case 'moe': {
        $share = (float) ($argv[2] ?? 0.5);
        $n = (int) ($argv[3] ?? 100);
        $poblacion = (int) ($argv[4] ?? 30000);
        echo json_encode(Telemetry::marginOfError($share, $n, $poblacion)), "\n";
        break;
    }

    case 'agegroup':
        echo Telemetry::ageGroup($argv[2] ?? null), "\n";
        break;

    case 'kanon':
        echo json_encode([
            'kAnonMin' => Telemetry::kAnonMin(),
            'publishable' => Telemetry::publishable((int) ($argv[2] ?? 0)),
        ]), "\n";
        break;

    case 'barrios':
        echo json_encode(Telemetry::barrios()), "\n";
        break;

    default:
        fwrite(STDERR, "Comandos: dhondt | moe | agegroup | kanon | barrios\n");
        exit(2);
}
