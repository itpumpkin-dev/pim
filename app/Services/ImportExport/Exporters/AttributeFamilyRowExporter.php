<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\AttributeFamily;
use App\Models\ExportConfig;

class AttributeFamilyRowExporter implements RowExporterInterface
{
    public function columns(): array
    {
        return ['code', 'name'];
    }

    public function rows(ExportConfig $config): \Generator
    {
        foreach (AttributeFamily::orderBy('id')->cursor() as $family) {
            yield [
                'code' => $family->code,
                'name' => $family->name ?? '',
            ];
        }
    }
}
