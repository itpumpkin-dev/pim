<?php

namespace App\Services\ImportExport;

class RowHeaderNormalizer
{
    /**
     * Rewrites a row's keys back to the raw column code, so every
     * RowImporterInterface::importRow() implementation only ever has to deal
     * with codes (e.g. `pname`) — never the localized label the sample
     * template now ships with (e.g. "Product Name"), and never having to
     * know which locale that label happened to be in.
     *
     * Matches case/whitespace-insensitively so a hand-typed header still
     * works. A key that's already a valid code (or matches neither) passes
     * through unchanged — a raw code in the file (e.g. from an older
     * already-downloaded template) still works exactly as before.
     *
     * @param  array<string, mixed>  $row
     * @param  array<string, string>  $columnLabels  code => label, from the importer this row is being read for
     * @return array<string, mixed>
     */
    public static function normalize(array $row, array $columnLabels): array
    {
        $labelToCode = [];
        foreach ($columnLabels as $code => $label) {
            $labelToCode[self::key($label)] = $code;
        }

        $normalized = [];
        foreach ($row as $key => $value) {
            if (array_key_exists($key, $columnLabels)) {
                $normalized[$key] = $value;
                continue;
            }

            $normalized[$labelToCode[self::key($key)] ?? $key] = $value;
        }

        return $normalized;
    }

    private static function key(string $value): string
    {
        return mb_strtolower(trim($value));
    }
}
