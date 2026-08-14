<?php

namespace App\Services\ImportExport\Importers;

use App\Models\AttributeFamily;
use App\Models\FamilyAttribute;
use App\Models\ImportConfig;
use App\Services\ImportExport\RowImportException;

class AttributeFamilyRowImporter implements RowImporterInterface
{
    use HasStaticColumnLabels;

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

        $name = trim((string) ($row['name'] ?? ''));

        AttributeFamily::updateOrCreate(
            ['code' => $code],
            ['name' => $name !== '' ? $name : ucfirst($code)]
        );

        return [];
    }
}
