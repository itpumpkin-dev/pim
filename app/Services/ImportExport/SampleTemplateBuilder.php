<?php

namespace App\Services\ImportExport;

class SampleTemplateBuilder
{
    /**
     * A header row plus one example row, as CSV text — regardless of the
     * config's chosen file_format, since this is just a schema reference.
     */
    public static function build(string $type): string
    {
        $columns = ImportExportRegistry::importer($type)->columns();
        $example = self::exampleRow($type);

        $handle = fopen('php://temp', 'r+');
        fputcsv($handle, $columns);
        fputcsv($handle, array_map(fn ($col) => $example[$col] ?? '', $columns));
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return $csv;
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
            default => [],
        };
    }
}
