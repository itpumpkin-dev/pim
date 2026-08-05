<?php

namespace Database\Seeders;

use App\Models\AttributeGroup;
use App\Models\AttributeGroupTranslation;
use App\Models\Locale;
use Illuminate\Database\Seeder;

class AttributeGroupTranslationSeeder extends Seeder
{
    /**
     * Human labels for the group set declared in AttributeGroupSeeder,
     * keyed by locale code. Only locales present here are backfilled; any
     * other currently-enabled locale is left for a translator to fill in
     * via the admin UI.
     *
     * code => [locale_code => label]
     */
    private const LABELS = [
        'general' => ['en' => 'General Information', 'th' => 'ข้อมูลทั่วไป', 'zh' => '基本信息'],
        'pricing_packaging' => ['en' => 'Pricing & Packaging', 'th' => 'ราคาและบรรจุภัณฑ์', 'zh' => '价格与包装'],
        'specifications' => ['en' => 'Specifications', 'th' => 'ข้อมูลจำเพาะ', 'zh' => '规格参数'],
        'warranty_usage' => ['en' => 'Warranty & Usage', 'th' => 'การรับประกันและการใช้งาน', 'zh' => '保修与使用'],
    ];

    /**
     * Backfills attribute_group_translations for every currently-enabled
     * locale, for whichever groups are missing a row. Existing rows are
     * left untouched so admin-edited labels are never overwritten.
     */
    public function run(): void
    {
        $locales = Locale::active();

        $groups = AttributeGroup::whereIn('code', array_keys(self::LABELS))->get(['id', 'code', 'name']);

        foreach ($groups as $group) {
            $labels = self::LABELS[$group->code] ?? [];
            $existingLocaleIds = AttributeGroupTranslation::where('attribute_group_id', $group->id)
                ->pluck('locale_id')
                ->all();

            foreach ($locales as $locale) {
                if (in_array($locale->id, $existingLocaleIds, true)) {
                    continue;
                }

                $label = $labels[$locale->code] ?? $group->name;

                AttributeGroupTranslation::create([
                    'attribute_group_id' => $group->id,
                    'locale_id' => $locale->id,
                    'label' => $label,
                ]);
            }
        }
    }
}
