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
     * A code may map to several labels (one per locale — see
     * labelsForAllLocales()) so a file whose header row is in Thai still
     * imports when the queue worker itself runs under the app's default
     * locale. Labels at the same position (= same locale) keep the original
     * rule — a later code wins a shared label — and position 0 (the current
     * locale) always beats the other locales' labels.
     *
     * @param  array<string, string|string[]>  $columnLabels  code => label(s), from the importer this row is being read for
     * @return array<string, mixed>
     */
    public static function normalize(array $row, array $columnLabels): array
    {
        $labelToCode = [];
        $depth = max(array_map(fn ($labels) => count((array) $labels), $columnLabels ?: [[]]));
        for ($i = $depth - 1; $i >= 0; $i--) {
            foreach ($columnLabels as $code => $labels) {
                $label = ((array) $labels)[$i] ?? null;
                if ($label !== null) {
                    $labelToCode[self::key($label)] = $code;
                }
            }
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

    /**
     * code => every label it has across the given locales (current app
     * locale first, so its labels win any cross-locale collision). An
     * import runs in a queue worker under APP_LOCALE, not the uploader's UI
     * locale — matching only that one locale's labels made every row of a
     * template downloaded in Thai fail with "sku is required".
     *
     * @param  callable(): array<string, string>  $labelsForCurrentLocale  e.g. fn () => $importer->columnLabels()
     * @param  string[]  $locales
     * @return array<string, string[]>
     */
    public static function labelsForAllLocales(callable $labelsForCurrentLocale, array $locales): array
    {
        $original = app()->getLocale();
        $locales = array_values(array_unique(array_merge([$original], $locales)));

        $merged = [];
        try {
            foreach ($locales as $locale) {
                app()->setLocale($locale);
                foreach ($labelsForCurrentLocale() as $code => $label) {
                    $merged[$code][] = $label;
                }
            }
        } finally {
            app()->setLocale($original);
        }

        // ไม่ตัดตัวซ้ำ — ตำแหน่งใน array = locale ซึ่ง normalize() ใช้จัดลำดับความสำคัญ
        return $merged;
    }

    private static function key(string $value): string
    {
        return mb_strtolower(trim($value));
    }
}
