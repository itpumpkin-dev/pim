<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\Category;
use App\Models\ExportConfig;
use App\Services\Catalog\AttributeValueFormatter;

class CategoryRowExporter implements RowExporterInterface
{
    public function columns(): array
    {
        return ['code', 'name', 'slug', 'description', 'parent_code', 'display_type', 'thumbnail', 'is_active'];
    }

    public function rows(ExportConfig $config): \Generator
    {
        foreach (Category::with('parent')->orderBy('id')->cursor() as $category) {
            yield [
                'code' => $category->code,
                'name' => $category->name,
                'slug' => $category->slug ?? '',
                'description' => $category->description ?? '',
                'parent_code' => $category->parent?->code ?? '',
                'display_type' => $category->display_type,
                // Resolved to a real, usable URL (same as CategoryRowImporter
                // expects on read) rather than the raw local storage path —
                // see AttributeValueFormatter::resolveStorageUrl()'s
                // already-absolute-URL passthrough for imported thumbnails.
                'thumbnail' => AttributeValueFormatter::resolveStorageUrl($category->thumbnail) ?? '',
                'is_active' => $category->is_active ? '1' : '0',
            ];
        }
    }
}
