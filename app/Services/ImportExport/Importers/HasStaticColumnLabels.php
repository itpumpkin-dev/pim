<?php

namespace App\Services\ImportExport\Importers;

/**
 * columnLabels() for an importer whose entire column set is fixed (no
 * dynamic per-attribute columns like ProductRowImporter has) — every one of
 * columns()'s entries is a key under lang/{locale}/import.php's 'columns'
 * array. Falls back to the raw code itself if a translation is somehow
 * missing, rather than surfacing a raw Laravel translation-missing string.
 */
trait HasStaticColumnLabels
{
    public function columnLabels(): array
    {
        $labels = [];
        foreach ($this->columns() as $column) {
            $label = __("import.columns.{$column}");
            $labels[$column] = $label === "import.columns.{$column}" ? $column : $label;
        }

        return $labels;
    }
}
