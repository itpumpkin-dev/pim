<?php

namespace App\Http\Controllers\Api\Concerns;

use Illuminate\Support\Collection;

/**
 * Shared by the read-only master-data API controllers (Category/Brand/
 * Attribute/BaseUnit lookups) to expose a name/label in every locale at
 * once, keyed by locale code — unlike each model's own name()/adminLabel()
 * accessor (see Category::name(), Attribute::name(), AttributeOption::
 * adminLabel()), which only resolves the single current-request locale.
 */
trait BuildsLocalizedLabelMap
{
    /**
     * @param  Collection  $translations  the model's loaded *Translation rows (locale_id + label)
     * @param  string|null  $default  fallback for a locale with no translation row, or an empty one
     * @param  Collection  $localeCodesById  Locale::pluck('code', 'id') — every active locale to guarantee a key for
     * @return array<string, string|null> locale code => label
     */
    private function localizedLabelMap(Collection $translations, ?string $default, Collection $localeCodesById): array
    {
        $map = [];
        foreach ($localeCodesById as $localeId => $code) {
            $map[$code] = $default;
        }

        foreach ($translations as $translation) {
            $label = trim((string) $translation->label);
            if ($label === '') {
                continue;
            }

            $code = $localeCodesById->get($translation->locale_id);
            if ($code !== null) {
                $map[$code] = $label;
            }
        }

        return $map;
    }
}
