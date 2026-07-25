<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\Category;
use App\Models\ExportConfig;

class CategoryRowExporter implements RowExporterInterface
{
    public function columns(): array
    {
        return ['code', 'name', 'description', 'parent_code'];
    }

    public function rows(ExportConfig $config): \Generator
    {
        foreach (Category::with('parent')->orderBy('id')->cursor() as $category) {
            yield [
                'code' => $category->code,
                'name' => $category->name,
                'description' => $category->description ?? '',
                'parent_code' => $category->parent?->code ?? '',
            ];
        }
    }
}
