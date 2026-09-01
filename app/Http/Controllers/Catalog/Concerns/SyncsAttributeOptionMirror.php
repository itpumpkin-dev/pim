<?php

namespace App\Http\Controllers\Catalog\Concerns;

use App\Models\Attribute;
use App\Models\AttributeOption;

/**
 * Keeps a master row (Points, Commission Groups, Business Types, Vendors,
 * Currencies) in sync with a matching `AttributeOption` row on a `select`
 * attribute already used in the product-edit Attributes tab (pointtype,
 * commission_group, business_type, vendor, purchase_currency) — so editing
 * the master immediately changes that attribute's dropdown, the same way
 * Brands/Base Units already work, without moving these masters' own rich
 * columns onto the shared `attribute_options` table.
 *
 * The master table stays the source of truth for everything except the
 * option's `code`/`admin_label`/`is_active`; the mirrored option carries no
 * per-locale translation (these masters have no locale concept of their
 * own — plain admin_label only, same as a legacy single-language option).
 */
trait SyncsAttributeOptionMirror
{
    /**
     * Create the option on first save, or find it by its *previous* code
     * (pass null on create) and update in place — renaming the option's
     * code too if the master's own code/key changed since.
     */
    private function syncAttributeOptionMirror(string $attributeCode, ?string $oldCode, string $newCode, ?string $label, bool $isActive = true): void
    {
        $attribute = Attribute::where('code', $attributeCode)->first();
        if (! $attribute) {
            return;
        }

        $option = AttributeOption::where('attribute_id', $attribute->id)
            ->where('code', $oldCode ?? $newCode)
            ->first();

        if ($option) {
            $option->update(['code' => $newCode, 'admin_label' => $label, 'is_active' => $isActive]);

            return;
        }

        AttributeOption::create([
            'attribute_id' => $attribute->id,
            'code' => $newCode,
            'admin_label' => $label,
            'is_active' => $isActive,
        ]);
    }

    private function removeAttributeOptionMirror(string $attributeCode, string $code): void
    {
        $attribute = Attribute::where('code', $attributeCode)->first();
        if (! $attribute) {
            return;
        }

        AttributeOption::where('attribute_id', $attribute->id)->where('code', $code)->delete();
    }
}
