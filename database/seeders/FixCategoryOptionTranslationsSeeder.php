<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Obsolete. This used to patch the pcatname/psubcatname/productgroupname
 * AttributeOption translations by option id, using
 * data/category_option_translations.php. Those options are now rebuilt from
 * the category tree by LegacyCategoryAttributeOptionsSeeder →
 * CategoryAttributeOptionSync::rebuildAll(), which assigns fresh ids and
 * mirrors each category's own translations (plus the English name from
 * additional_data.name_eng), so the old id-keyed data no longer lines up.
 * Kept as a no-op so DatabaseSeeder's call list doesn't break.
 */
class FixCategoryOptionTranslationsSeeder extends Seeder
{
    public function run(): void
    {
        // no-op — see class docblock
    }
}
