<?php
/**
 * Utilidades del Motor de Inteligencia que se comparten entre endpoints.
 *
 * Dos cosas viven acá porque tienen que dar el mismo resultado en todos lados:
 * el seudónimo del sujeto y la compuerta de k-anonimato. Si `ingest.php` y
 * `metrics.php` calcularan cada uno lo suyo, el día que una cambie el otro
 * publica de más.
 */

declare(strict_types=1);

namespace Esquel;

final class Telemetry
{
    /**
     * Seudónimo rotativo del sujeto: HMAC-SHA256 del id de usuario con la sal
     * del período, truncado a 128 bits.
     *
     * No es reversible y **cambia cuando rota la sal**, así que dos períodos no
     * se pueden empalmar para seguir a una persona en el tiempo. Ese es
     * exactamente el punto: sirve para contar personas distintas dentro de una
     * ventana, no para construir un historial.
     */
    public static function subject(int|string $usuarioId): string
    {
        $salt = (string) Config::get('telemetry.pseudonym_salt', '');
        if ($salt === '') {
            // Sin sal configurada, se deriva una del secreto JWT. No es lo ideal
            // —no rota— pero evita que un despliegue mal configurado escriba el
            // id de usuario en claro en la tabla de telemetría.
            $salt = 'derivada:' . hash('sha256', (string) Config::get('jwt.secret'));
        }
        return substr(hash_hmac('sha256', (string) $usuarioId, $salt), 0, 32);
    }

    /** Umbral de k-anonimato vigente. Debe coincidir con `K_ANON_MIN` de /shared. */
    public static function kAnonMin(): int
    {
        return max(1, (int) Config::get('telemetry.k_anon_min', 15));
    }

    /** ¿Esta celda se puede publicar? */
    public static function publishable(int $n): bool
    {
        return $n >= self::kAnonMin();
    }

    /**
     * Margen de error al 95% de una proporción, con corrección por población
     * finita. Gemela de `marginOfError()` en `/shared/util/intelligence.ts`.
     */
    public static function marginOfError(float $share, int $n, int $population = 30000): float
    {
        if ($n <= 1) {
            return 1.0;
        }
        $p = max(0.0, min(1.0, $share));
        $base = 1.96 * sqrt(($p * (1 - $p)) / $n);
        if ($population <= $n) {
            return round($base, 5);
        }
        $fpc = sqrt(($population - $n) / ($population - 1));
        return round($base * $fpc, 5);
    }

    /**
     * Reparto D'Hondt, gemelo de `dHondt()` en `/shared/util/intelligence.ts`.
     *
     * Los dos lados tienen que dar exactamente lo mismo: el dashboard muestra el
     * número que calcula PHP y el motor del VPS proyecta con el de TypeScript.
     * Si divergen, un candidato ve dos bancas distintas según dónde mire.
     * `tools/ci/test-intelligence.ts` compara las dos implementaciones.
     *
     * @param array<int, float> $shares Share por facción [0,1].
     * @return array<int, int> Bancas por facción.
     */
    public static function dHondt(array $shares, int $bancas = 11, float $piso = 0.03): array
    {
        $votos = [];
        foreach ($shares as $id => $share) {
            $votos[(int) $id] = (int) round(max(0.0, min(1.0, (float) $share)) * 10000);
        }

        $total = array_sum($votos);
        $asignadas = array_fill_keys(array_keys($votos), 0);
        if ($total <= 0 || $bancas <= 0) {
            return $asignadas;
        }

        $compiten = array_filter($votos, static fn (int $v): bool => $v / $total >= $piso);
        if ($compiten === []) {
            return $asignadas;
        }

        for ($i = 0; $i < $bancas; $i++) {
            $mejorId = null;
            $mejorCociente = -1.0;
            foreach ($compiten as $id => $v) {
                $cociente = $v / ($asignadas[$id] + 1);
                // Empate: gana la lista con más votos; si también empatan, el id menor.
                if (
                    $cociente > $mejorCociente + 1e-9
                    || (abs($cociente - $mejorCociente) <= 1e-9
                        && ($mejorId === null
                            || $v > $compiten[$mejorId]
                            || ($v === $compiten[$mejorId] && $id < $mejorId)))
                ) {
                    $mejorCociente = $cociente;
                    $mejorId = $id;
                }
            }
            if ($mejorId === null) {
                break;
            }
            $asignadas[$mejorId]++;
        }

        return $asignadas;
    }

    /**
     * Deja pasar sólo los nombres de evento conocidos. Es una lista blanca
     * deliberada: un evento nuevo en el cliente no entra a la base hasta que
     * alguien lo agregue acá y en `/shared/types/telemetry.ts`.
     *
     * @return list<string>
     */
    public static function allowedEvents(): array
    {
        return [
            'app_boot', 'frame_stats', 'client_error', 'asset_load_fail',
            'session_start', 'session_end', 'onboarding_complete', 'shard_join', 'shard_leave',
            'cell_enter', 'poi_visit', 'zone_dwell',
            'quest_start', 'quest_finish', 'rank_up', 'debate_finish', 'rally_join',
            'chat_volume', 'voice_minutes', 'report_submitted',
            'shop_purchase', 'item_use', 'money_sink',
            'vote_intent', 'issue_priority', 'candidate_reaction', 'news_reaction', 'faction_switch',
            'sponsor_impression', 'sponsor_enter', 'sponsor_buff_claim', 'sponsor_cta_click',
        ];
    }

    /** Categorías válidas de evento. */
    public static function allowedKinds(): array
    {
        return ['sistema', 'sesion', 'movimiento', 'progresion', 'social', 'economia', 'politico', 'comercial'];
    }

    /** Barrios válidos, en el mismo orden que `BARRIOS` de /shared. */
    public static function barrios(): array
    {
        return [
            'centro', 'badenes', 'ceferino', 'bella_vista', 'don_bosco', 'estacion',
            'zona_norte', 'alta_esquel', 'plan_1000', 'valle_chico',
            'matadero', 'villa_ayelen', 'alto_rio_percy', 'otro',
        ];
    }

    /** Franjas etarias declarables. */
    public static function ageBands(): array
    {
        return ['16-17', '18-24', '25-34', '35-49', '50-64', '65+'];
    }

    /**
     * Colapsa la banda fina a la franja de reporte de cuatro cubetas.
     * Gemela de `ageGroupOf()` en `/shared/types/intelligence.ts`.
     */
    public static function ageGroup(?string $band): string
    {
        return match ($band) {
            '16-17', '18-24' => '16-24',
            '25-34' => '25-39',
            '35-49', '50-64' => '40-59',
            '65+' => '60+',
            default => '25-39',
        };
    }
}
