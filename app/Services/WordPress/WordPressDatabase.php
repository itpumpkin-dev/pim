<?php

namespace App\Services\WordPress;

use mysqli;
use RuntimeException;

/**
 * Thin `mysqli` wrapper around the WordPress/WooCommerce site's own
 * database, connected through the local end of a WordPressTunnel (never the
 * SSH host directly — MySQL there only binds to loopback). Mirrors
 * WooCommerceClient's shape: config read in the constructor, fail-fast on
 * missing config, every call funneled through one error handler.
 */
class WordPressDatabase
{
    private mysqli $connection;

    public function __construct(int $localPort)
    {
        $config = config('services.wordpress_db');

        if (empty($config['db_database']) || empty($config['db_username'])) {
            throw new RuntimeException('WordPress DB is not configured — set WORDPRESS_DB_DATABASE/WORDPRESS_DB_USERNAME/WORDPRESS_DB_PASSWORD in .env.');
        }

        $connection = @mysqli_connect(
            '127.0.0.1',
            $config['db_username'],
            (string) $config['db_password'],
            $config['db_database'],
            $localPort,
        );

        if (!$connection) {
            throw new RuntimeException('Could not connect to the WordPress database through the tunnel: '.mysqli_connect_error());
        }

        $connection->set_charset('utf8mb4');
        $this->connection = $connection;
    }

    /**
     * @param  array<int, string>  $params
     * @return array<string, mixed>|null
     */
    public function fetchOne(string $sql, array $params = []): ?array
    {
        $rows = $this->fetchAll($sql, $params);

        return $rows[0] ?? null;
    }

    /**
     * @param  array<int, string>  $params
     * @return array<int, array<string, mixed>>
     */
    public function fetchAll(string $sql, array $params = []): array
    {
        $stmt = $this->prepareAndExecute($sql, $params);
        $result = $stmt->get_result();
        $rows = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
        $stmt->close();

        return $rows;
    }

    /**
     * INSERT/UPDATE — returns the affected row count (or, for an INSERT,
     * the caller can read insertId() right after).
     */
    public function execute(string $sql, array $params = []): int
    {
        $stmt = $this->prepareAndExecute($sql, $params);
        $affected = $stmt->affected_rows;
        $stmt->close();

        return $affected;
    }

    public function insertId(): int
    {
        return (int) $this->connection->insert_id;
    }

    private function prepareAndExecute(string $sql, array $params): \mysqli_stmt
    {
        $stmt = $this->connection->prepare($sql);
        if (!$stmt) {
            throw new RuntimeException("WordPress DB query failed to prepare: {$this->connection->error}\nSQL: {$sql}");
        }

        if (!empty($params)) {
            $types = str_repeat('s', count($params));
            $stmt->bind_param($types, ...$params);
        }

        if (!$stmt->execute()) {
            throw new RuntimeException("WordPress DB query failed to execute: {$stmt->error}\nSQL: {$sql}");
        }

        return $stmt;
    }

    public function close(): void
    {
        $this->connection->close();
    }
}
