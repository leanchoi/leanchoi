<?php
/**
 * Validación del onboarding.
 *
 * La consigna es fricción cero: menos de 30 segundos para estar caminando por
 * Esquel. Así que se valida lo mínimo indispensable y se rechaza con mensajes
 * que un vecino entienda, no con códigos.
 */

declare(strict_types=1);

namespace Esquel;

final class Validation
{
    /** Barrios jugables. Espejo de `BARRIOS` en `/shared/types/common.ts`. */
    public const BARRIOS = [
        'centro', 'badenes', 'ceferino', 'bella_vista', 'don_bosco',
        'estacion', 'zona_norte', 'alta_esquel', 'plan_1000', 'valle_chico', 'otro',
    ];

    public const GENEROS = ['femenino', 'masculino', 'no_binario', 'prefiere_no_decir'];

    public const INTERESES = ['nulo', 'bajo', 'medio', 'alto', 'militante'];

    /** Alias: 3 a 24 caracteres, letras, números, punto, guion y espacio simple. */
    public static function alias(string $alias): ?string
    {
        $alias = trim(preg_replace('/\s+/u', ' ', $alias) ?? '');
        if (mb_strlen($alias) < 3 || mb_strlen($alias) > 24) {
            return null;
        }
        if (!preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u', $alias)) {
            return null;
        }

        return $alias;
    }

    public static function password(string $password): bool
    {
        // Ocho caracteres. Nada de exigir mayúscula, número y símbolo: eso no
        // hace más seguro a nadie y espanta al que quiere entrar a jugar.
        return mb_strlen($password) >= 8 && mb_strlen($password) <= 128;
    }

    public static function edad(mixed $value): ?int
    {
        if (!is_numeric($value)) {
            return null;
        }
        $edad = (int) $value;

        return ($edad >= 13 && $edad <= 110) ? $edad : null;
    }

    public static function enOpciones(mixed $value, array $options, string $default): string
    {
        return in_array($value, $options, true) ? (string) $value : $default;
    }

    /** Normaliza el email si vino; es opcional en el registro rápido. */
    public static function email(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }
        $email = mb_strtolower(trim($value));

        return filter_var($email, FILTER_VALIDATE_EMAIL) === false ? null : $email;
    }
}
