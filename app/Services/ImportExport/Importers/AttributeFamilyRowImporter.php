<?php

namespace App\Services\ImportExport\Importers;

use App\Models\AttributeFamily;
use App\Models\AttributeFamilyTranslation;
use App\Models\FamilyAttribute;
use App\Models\ImportConfig;
use App\Services\ImportExport\Importers\Concerns\WritesLocalizedTranslation;
use App\Services\ImportExport\RowImportException;

class AttributeFamilyRowImporter implements RowImporterInterface
{
    use HasStaticColumnLabels;
    use WritesLocalizedTranslation;

    public function columns(): array
    {
        return ['code', 'name'];
    }

    public function requiredColumns(): array
    {
        return ['code'];
    }

    public function importRow(array $row, ImportConfig $config): array
    {
        $code = trim((string) ($row['code'] ?? ''));
        if ($code === '') {
            throw new RowImportException('code is required');
        }

        if ($config->action === 'delete') {
            $family = AttributeFamily::where('code', $code)->first();
            if (!$family) {
                throw new RowImportException("Attribute family with code '{$code}' not found");
            }
            FamilyAttribute::where('family_id', $family->id)->delete();
            $family->delete();
            return [];
        }

        $existing = AttributeFamily::where('code', $code)->first();
        $name = trim((string) ($row['name'] ?? ''));
        $rawName = $name !== ''
            ? $this->resolveRawColumnValue($existing?->getRawOriginal('name'), $name, $config->source_locale)
            : ucfirst($code);

        $family = AttributeFamily::updateOrCreate(
            ['code' => $code],
            ['name' => $rawName]
        );

        if ($name !== '') {
            $this->writeLocalizedTranslation(
                AttributeFamilyTranslation::class,
                'attribute_family_id',
                $family->id,
                $name,
                $config->source_locale,
                (bool) $config->ai_translate,
            );
        }

        return [];
    }
}
