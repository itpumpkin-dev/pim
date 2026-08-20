<?php

namespace App\Services\ImportExport\Importers;

use App\Models\Category;
use App\Models\CategoryTranslation;
use App\Models\ImportConfig;
use App\Services\ImportExport\Importers\Concerns\WritesLocalizedTranslation;
use App\Services\ImportExport\RowImportException;

class CategoryRowImporter implements RowImporterInterface
{
    use HasStaticColumnLabels;
    use WritesLocalizedTranslation;

    /**
     * Mirrors CategoryController::DISPLAY_TYPES — kept as its own copy here
     * rather than a shared constant since that one is `private` to the
     * controller and this importer has no other dependency on it, same as
     * how ProductRowImporter hardcodes its own `type` enum inline.
     */
    private const DISPLAY_TYPES = ['default', 'products', 'subcategories', 'both'];

    public function columns(): array
    {
        return ['code', 'name', 'slug', 'description', 'parent_code', 'display_type', 'thumbnail', 'is_active'];
    }

    public function requiredColumns(): array
    {
        return ['code', 'name'];
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

        $displayType = strtolower(trim((string) ($row['display_type'] ?? '')));
        if ($displayType !== '' && !in_array($displayType, self::DISPLAY_TYPES, true)) {
            throw new RowImportException("display_type must be one of: ".implode(', ', self::DISPLAY_TYPES));
        }

        // Same "1/true/yes" acceptance ProductRowImporter uses for its own
        // `enabled` column — defaults to active (matching the `is_active`
        // column's own DB default) when the row leaves it blank.
        $isActiveRaw = strtolower(trim((string) ($row['is_active'] ?? '1')));
        $isActive = in_array($isActiveRaw, ['1', 'true', 'yes'], true);

        $slug = trim((string) ($row['slug'] ?? ''));
        // A plain CSV/XLSX row can't carry an image file — this only
        // accepts an already-hosted URL (same as importFromWoocommerce()'s
        // thumbnail_url), not a local upload. Left blank keeps whatever
        // thumbnail (if any) the category already has, same "don't wipe
        // what a file input can't resupply" reasoning the create/edit forms
        // use for their own thumbnail upload.
        $thumbnail = trim((string) ($row['thumbnail'] ?? ''));

        $existing = Category::where('code', $code)->first();
        $rawName = $this->resolveRawColumnValue($existing?->getRawOriginal('name'), $name, $config->source_locale);

        $category = Category::updateOrCreate(
            ['code' => $code],
            [
                'name' => $rawName,
                'slug' => $slug !== '' ? $slug : null,
                'description' => ($row['description'] ?? '') !== '' ? $row['description'] : null,
                'parent_id' => $parent?->id,
                'display_type' => $displayType !== '' ? $displayType : 'default',
                'thumbnail' => $thumbnail !== '' ? $thumbnail : ($existing->thumbnail ?? null),
                'is_active' => $isActive,
            ]
        );

        $this->writeLocalizedTranslation(
            CategoryTranslation::class,
            'category_id',
            $category->id,
            $name,
            $config->source_locale,
            (bool) $config->ai_translate,
        );

        return [];
    }
}
