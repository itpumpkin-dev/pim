<?php

namespace App\Services\Catalog;

use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;

/**
 * The option-writer shared by every "attribute options mirror some external
 * source" service — MasterAttributeOptionSync (internal tables) and
 * ApiAttributeOptionSync (external HTTP APIs). Pulled out of
 * MasterAttributeOptionSync so the `is_customized`-preserving upsert logic
 * exists in exactly one place; see MasterAttributeOptionSync::rebuildAttribute()
 * for the reasoning behind never blanket-deleting before upserting.
 */
class AttributeOptionMirror
{
    public function normaliseCode(?string $code): ?string
    {
        $code = strtolower(trim((string) $code));

        return $code === '' ? null : $code;
    }

    /**
     * @param  array{code: string, label: ?string, is_active?: bool, translations?: array<int, string>}  $row
     */
    public function upsertOption(int $attributeId, array $row): void
    {
        $code = $this->normaliseCode($row['code']);
        if ($code === null) {
            return;
        }

        $option = AttributeOption::firstOrNew(['attribute_id' => $attributeId, 'code' => $code]);

        if ($option->exists && $option->is_customized) {
            // A customized option keeps whatever the admin set until they
            // explicitly reset it back to the source — see
            // MasterAttributeOptionSync::resetOptionToMaster().
            return;
        }

        $option->admin_label = trim((string) ($row['label'] ?? '')) ?: $code;
        if (array_key_exists('is_active', $row)) {
            $option->is_active = (bool) $row['is_active'];
        }
        $option->save();

        $kept = [];
        foreach (($row['translations'] ?? []) as $localeId => $label) {
            if (trim((string) $label) === '') {
                continue;
            }
            AttributeOptionTranslation::updateOrCreate(
                ['attribute_option_id' => $option->id, 'locale_id' => $localeId],
                ['label' => $label],
            );
            $kept[] = $localeId;
        }
        AttributeOptionTranslation::where('attribute_option_id', $option->id)
            ->when($kept, fn ($q) => $q->whereNotIn('locale_id', $kept))
            ->delete();
    }
}
