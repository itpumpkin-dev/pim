<?php

namespace App\Services\ImportExport\Importers;

use App\Models\Attribute;
use App\Models\ImportConfig;
use App\Services\ImportExport\RowImportException;

class AttributeRowImporter implements RowImporterInterface
{
    private const TYPES = ['text', 'textarea', 'price', 'boolean', 'select', 'multiselect', 'datetime', 'date', 'image', 'gallery', 'file', 'checkbox'];

    public function columns(): array
    {
        return ['code', 'name', 'type', 'is_required', 'is_unique', 'is_locale_based', 'is_channel_based', 'is_filterable'];
    }

    public function importRow(array $row, ImportConfig $config): array
    {
        $code = trim((string) ($row['code'] ?? ''));
        if ($code === '' || !preg_match('/^[a-z][a-z0-9_]*$/', $code)) {
            throw new RowImportException("Invalid or missing code '{$code}'");
        }

        if ($config->action === 'delete') {
            $attribute = Attribute::where('code', $code)->first();
            if (!$attribute) {
                throw new RowImportException("Attribute with code '{$code}' not found");
            }
            $attribute->delete();
            return [];
        }

        $type = trim((string) ($row['type'] ?? 'text'));
        if (!in_array($type, self::TYPES, true)) {
            throw new RowImportException("Invalid attribute type '{$type}'");
        }

        Attribute::updateOrCreate(
            ['code' => $code],
            [
                'name' => ($row['name'] ?? '') !== '' ? $row['name'] : null,
                'type' => $type,
                'is_required' => $this->toBool($row['is_required'] ?? false),
                'is_unique' => $this->toBool($row['is_unique'] ?? false),
                'is_locale_based' => $this->toBool($row['is_locale_based'] ?? false),
                'is_channel_based' => $this->toBool($row['is_channel_based'] ?? false),
                'is_filterable' => $this->toBool($row['is_filterable'] ?? false),
            ]
        );

        return [];
    }

    private function toBool(mixed $value): bool
    {
        return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes'], true);
    }
}
