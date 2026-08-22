<?php
/**
 * Conexión PDO a MySQL.
 *
 * Una sola conexión por request (PHP muere al terminar, así que no hace falta
 * pool). Excepciones activadas, sin emulación de prepares: las consultas van
 * parametrizadas de verdad al servidor.
 */

declare(strict_types=1);

namespace Esquel;

use PDO;
use PDOException;

final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $dsn = (string) Config::get('db.dsn');
        $user = (string) Config::get('db.user');
        $password = (string) Config::get('db.password');

        try {
            self::$pdo = new PDO($dsn, $user, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]);
            // Todo en UTC: el huso de Esquel se aplica al mostrar, no al guardar.
            self::$pdo->exec("SET time_zone = '+00:00'");
        } catch (PDOException $e) {
            throw new \RuntimeException('No se pudo conectar a MySQL: ' . $e->getMessage(), 0, $e);
        }

        return self::$pdo;
    }

    /** @param array<string|int, mixed> $params */
    public static function run(string $sql, array $params = []): \PDOStatement
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);

        return $statement;
    }

    /** @return array<string, mixed>|null */
    public static function first(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();

        return $row === false ? null : $row;
    }

    public static function transaction(callable $work): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $work($pdo);
            $pdo->commit();

            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** Sólo para tests. */
    public static function inject(?PDO $pdo): void
    {
        self::$pdo = $pdo;
    }
}
