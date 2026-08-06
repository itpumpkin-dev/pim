<?php

namespace App\Services;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Generates a `code` value (matching this app's `^[a-z][a-z0-9_]*$`
 * convention) as "{$prefix}_{n}", independent of whatever name/label the
 * user typed — so create forms don't need a manual code field, and the
 * result doesn't depend on what script the name happens to be written in
 * (a name-derived slug is meaningless for Thai/Chinese/Japanese input,
 * since there's no Latin transliteration to fall back to).
 */
class CodeGenerator
{
    /**
     * Generates a sequential code and creates the record via $create($code)
     * in one step, retrying with the next number if two requests race to
     * the same "next" code — $create's insert then trips the column's DB
     * unique constraint instead of silently producing a duplicate. A plain
     * sequential() + manual create() would let that exception bubble up as
     * an unhandled 500; this is the safe way to call it.
     *
     * @param  array<string, mixed>  $scope  extra equality constraints for the uniqueness check,
     *                                       e.g. ['attribute_id' => $id] for attribute_options
     * @param  callable(string): mixed  $create  receives the generated code, returns the created model
     */
    public static function createWithRetry(
        string $table,
        string $prefix,
        callable $create,
        string $column = 'code',
        int $maxLength = 100,
        array $scope = [],
        int $maxAttempts = 3,
    ): mixed {
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            $code = self::sequential($table, $prefix, $column, $maxLength, $scope);

            try {
                return $create($code);
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= $maxAttempts) {
                    throw $e;
                }
            }
        }
    }

    /**
     * @param  array<string, mixed>  $scope  extra equality constraints for the uniqueness check,
     *                                       e.g. ['attribute_id' => $id] for attribute_options
     */
    public static function sequential(
        string $table,
        string $prefix,
        string $column = 'code',
        int $maxLength = 100,
        array $scope = [],
        ?int $ignoreId = null,
        string $idColumn = 'id',
    ): string {
        // Leave room for a "_NNNNN" suffix within the column's max length.
        $prefix = mb_substr($prefix, 0, max($maxLength - 8, 1));

        $next = self::nextNumber($table, $column, $prefix, $scope, $ignoreId, $idColumn);

        return "{$prefix}_{$next}";
    }

    /**
     * @param  array<string, mixed>  $scope
     */
    private static function nextNumber(string $table, string $column, string $prefix, array $scope, ?int $ignoreId, string $idColumn): int
    {
        $query = DB::table($table)->where($column, 'like', addcslashes($prefix, '%_').'\_%');

        foreach ($scope as $scopeColumn => $scopeValue) {
            $query->where($scopeColumn, $scopeValue);
        }

        if ($ignoreId !== null) {
            $query->where($idColumn, '!=', $ignoreId);
        }

        $max = 0;
        foreach ($query->pluck($column) as $existingCode) {
            if (preg_match('/^'.preg_quote($prefix, '/').'_(\d+)$/', (string) $existingCode, $m)) {
                $max = max($max, (int) $m[1]);
            }
        }

        return $max + 1;
    }
}
