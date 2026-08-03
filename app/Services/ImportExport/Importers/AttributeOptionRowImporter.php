<?php

namespace App\Services\ImportExport\Importers;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AuditLog;
use App\Models\ImportConfig;
use App\Services\ImportExport\RowImportException;

/**
 * AttributeRowImporter only creates the Attribute definition itself — a
 * select/multiselect attribute imported that way ends up with zero options.
 * This importer fills that gap, keyed by (attribute_code, code) so re-running
 * the same file updates existing options instead of duplicating them.
 */
class AttributeOptionRowImporter implements RowImporterInterface
{
    public function columns(): array
    {
        return ['attribute_code', 'code', 'admin_label', 'swatch_value', 'sort_order'];
    }

    public function requiredColumns(): array
    {
        return ['attribute_code', 'code'];
    }

    public function importRow(array $row, ImportConfig $config): array
    {
        $attributeCode = trim((string) ($row['attribute_code'] ?? ''));
        $attribute = Attribute::where('code', $attributeCode)->first();
        if (!$attribute) {
            throw new RowImportException("Unknown attribute_code '{$attributeCode}'");
        }

        $code = trim((string) ($row['code'] ?? ''));
        if ($code === '' || !preg_match('/^[a-z][a-z0-9_]*$/', $code)) {
            throw new RowImportException("Invalid or missing code '{$code}' (lowercase letters, numbers, underscores; must start with a letter)");
        }

        $existing = AttributeOption::where('attribute_id', $attribute->id)->where('code', $code)->first();

        if ($config->action === 'delete') {
            if (!$existing) {
                throw new RowImportException("Option '{$code}' not found for attribute '{$attributeCode}'");
            }

            $oldFields = $this->auditFields($existing);
            $existing->delete();
            AuditLog::record('option_deleted', $attribute, $oldFields, null, $config->created_by);
            return [];
        }

        $sortOrderRaw = $row['sort_order'] ?? null;

        $option = AttributeOption::updateOrCreate(
            ['attribute_id' => $attribute->id, 'code' => $code],
            [
                'admin_label' => ($row['admin_label'] ?? '') !== '' ? $row['admin_label'] : null,
                'swatch_value' => ($row['swatch_value'] ?? '') !== '' ? $row['swatch_value'] : null,
                'sort_order' => is_numeric($sortOrderRaw) ? (int) $sortOrderRaw : ($existing?->sort_order ?? 0),
            ]
        );

        $newFields = $this->auditFields($option);

        if (!$existing) {
            AuditLog::record('option_created', $attribute, null, $newFields, $config->created_by);
            return [];
        }

        $oldFields = $this->auditFields($existing);
        if ($oldFields !== $newFields) {
            AuditLog::record('option_updated', $attribute, $oldFields, $newFields, $config->created_by);
        }

        return [];
    }

    /**
     * Mirrors AttributeOptionController::optionAuditFields() — options are
     * audited against the parent attribute, not themselves, so imported
     * changes show up in the same History tab as manual edits.
     */
    private function auditFields(AttributeOption $option): array
    {
        $prefix = "option#{$option->id}";

        return collect($option->only(['code', 'admin_label', 'swatch_value', 'sort_order']))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
    }
}
