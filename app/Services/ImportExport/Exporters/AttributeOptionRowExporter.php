<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\AttributeOption;
use App\Models\ExportConfig;

class AttributeOptionRowExporter implements RowExporterInterface
{
    public function columns(): array
    {
        return ['attribute_code', 'code', 'admin_label', 'swatch_value', 'sort_order'];
    }

    public function rows(ExportConfig $config): \Generator
    {
        foreach (AttributeOption::with('attribute')->orderBy('attribute_id')->orderBy('sort_order')->cursor() as $option) {
            yield [
                'attribute_code' => $option->attribute?->code ?? '',
                'code' => $option->code,
                'admin_label' => $option->admin_label ?? '',
                'swatch_value' => $option->swatch_value ?? '',
                'sort_order' => (string) $option->sort_order,
            ];
        }
    }
}
