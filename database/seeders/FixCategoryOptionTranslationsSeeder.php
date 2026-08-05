<?php

namespace Database\Seeders;

use App\Models\AttributeOptionTranslation;
use App\Models\Locale;
use Illuminate\Database\Seeder;

/**
 * One-off correction for the pcatname/psubcatname/productgroupname
 * AttributeOption taxonomy (1,086 options): the inline backfill in
 * 2026_08_05_000001_create_attribute_option_translations_table.php copied
 * each option's Thai admin_label into the "en" locale row, because it
 * blindly used config('app.locale') without checking what language the
 * text actually was. This moves that row to "th" (where a "th" row
 * doesn't already exist) and writes the real hand-translated English and
 * Chinese labels from data/category_option_translations.php.
 */
class FixCategoryOptionTranslationsSeeder extends Seeder
{
    public function run(): void
    {
        $translations = require database_path('seeders/data/category_option_translations.php');

        $locales = Locale::active()->keyBy('code');
        $thId = $locales->get('th')?->id;
        $enId = $locales->get('en')?->id;
        $zhId = $locales->get('zh')?->id;

        if (!$thId || !$enId || !$zhId) {
            throw new \RuntimeException('Expected th, en, and zh to all be active locales.');
        }

        $optionIds = array_keys($translations);

        AttributeOptionTranslation::whereIn('attribute_option_id', $optionIds)
            ->where('locale_id', $enId)
            ->whereNotIn('attribute_option_id', function ($query) use ($thId) {
                $query->select('attribute_option_id')
                    ->from('attribute_option_translations')
                    ->where('locale_id', $thId);
            })
            ->update(['locale_id' => $thId]);

        foreach ($translations as $optionId => $labels) {
            AttributeOptionTranslation::updateOrCreate(
                ['attribute_option_id' => $optionId, 'locale_id' => $enId],
                ['label' => $labels['en']]
            );

            AttributeOptionTranslation::updateOrCreate(
                ['attribute_option_id' => $optionId, 'locale_id' => $zhId],
                ['label' => $labels['zh']]
            );
        }
    }
}
