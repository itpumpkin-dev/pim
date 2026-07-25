<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\Attribute;
use App\Models\ExportConfig;

class AttributeRowExporter implements RowExporterInterface
{
    public function columns(): array
    {
        return ['code', 'name', 'type', 'is_required', 'is_unique', 'is_locale_based', 'is_channel_based', 'is_filterable'];
    }

    public function rows(ExportConfig $config): \Generator
    {
        foreach (Attribute::orderBy('id')->cursor() as $attribute) {
            yield [
                'code' => $attribute->code,
                'name' => $attribute->name ?? '',
                'type' => $attribute->type,
                'is_required' => $attribute->is_required ? '1' : '0',
                'is_unique' => $attribute->is_unique ? '1' : '0',
                'is_locale_based' => $attribute->is_locale_based ? '1' : '0',
                'is_channel_based' => $attribute->is_channel_based ? '1' : '0',
                'is_filterable' => $attribute->is_filterable ? '1' : '0',
            ];
        }
    }
}
