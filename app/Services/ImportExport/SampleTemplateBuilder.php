<?php

namespace App\Services\ImportExport;

use App\Models\User;

class SampleTemplateBuilder
{
    /**
     * A header row (localized column labels) plus one example row, in the
     * generic {columns, rows} shape SpreadsheetWriter expects so the caller
     * can render it as either CSV or XLSX — this is just a schema reference,
     * independent of the config's chosen file_format. $user, when given,
     * drops columns for 'products' attributes that user's role can't edit
     * (see AttributeAccessPolicy) — no point handing out a template column
     * they'd never be allowed to fill in anyway.
     *
     * Header cells are the localized label, not the raw code — readable to
     * fill in by hand. RowHeaderNormalizer maps it straight back to the code
     * on import, so this is purely cosmetic for the importer side.
     *
     * @return array{columns: array<int, string>, rows: array<int, array<string, string>>}
     */
    public static function build(string $type, ?User $user = null): array
    {
        $importer = ImportExportRegistry::importer($type, $user);
        $columns = $importer->columns();
        $labels = $importer->columnLabels();
        $example = self::exampleRow($type);

        $headerLabels = array_map(fn ($col) => $labels[$col] ?? $col, $columns);
        $row = [];
        foreach ($columns as $i => $col) {
            $row[$headerLabels[$i]] = $example[$col] ?? '';
        }

        return ['columns' => $headerLabels, 'rows' => [$row]];
    }

    private static function exampleRow(string $type): array
    {
        return match ($type) {
            'products' => ['sku' => 'SKU-0001', 'family_code' => 'default', 'type' => 'simple', 'enabled' => '1'],
            'categories' => ['code' => 'shoes', 'name' => 'Shoes', 'description' => 'Footwear', 'parent_code' => ''],
            'attributes' => [
                'code' => 'color', 'name' => 'Color', 'type' => 'text', 'is_required' => '0',
                'is_unique' => '0', 'is_locale_based' => '0', 'is_channel_based' => '0', 'is_filterable' => '1',
            ],
            'attribute_families' => ['code' => 'default', 'name' => 'Default'],
            'attribute_options' => [
                'attribute_code' => 'color', 'code' => 'red', 'admin_label' => 'Red', 'swatch_value' => '#ff0000', 'sort_order' => '0',
            ],
            default => [],
        };
    }
}
