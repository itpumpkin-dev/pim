<?php

namespace App\Services\ImportExport\Importers;

use App\Models\Category;
use App\Models\ImportConfig;
use App\Services\ImportExport\RowImportException;

class CategoryRowImporter implements RowImporterInterface
{
    public function columns(): array
    {
        return ['code', 'name', 'description', 'parent_code'];
    }

    public function importRow(array $row, ImportConfig $config): array
    {
        $code = trim((string) ($row['code'] ?? ''));
        if ($code === '' || !preg_match('/^[a-z][a-z0-9_]*$/', $code)) {
            throw new RowImportException("Invalid or missing code '{$code}' (lowercase letters, numbers, underscores; must start with a letter)");
        }

        if ($config->action === 'delete') {
            $category = Category::where('code', $code)->first();
            if (!$category) {
                throw new RowImportException("Category with code '{$code}' not found");
            }
            $category->delete();
            return [];
        }

        $parentCode = trim((string) ($row['parent_code'] ?? ''));
        $parent = null;
        if ($parentCode !== '') {
            $parent = Category::where('code', $parentCode)->first();
            if (!$parent) {
                throw new RowImportException("Unknown parent_code '{$parentCode}'");
            }
        }

        $name = trim((string) ($row['name'] ?? ''));
        if ($name === '') {
            throw new RowImportException('name is required');
        }

        Category::updateOrCreate(
            ['code' => $code],
            [
                'name' => $name,
                'description' => ($row['description'] ?? '') !== '' ? $row['description'] : null,
                'parent_id' => $parent?->id,
            ]
        );

        return [];
    }
}
