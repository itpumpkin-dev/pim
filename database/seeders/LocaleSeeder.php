<?php

namespace Database\Seeders;

use App\Models\Locale;
use Illuminate\Database\Seeder;

class LocaleSeeder extends Seeder
{
    /**
     * Seed the shared locale set. Both the UI-translation layer and the
     * (future) catalog/content-translation layer read from this table as
     * the single source of truth for which languages exist.
     */
    public function run(): void
    {
        $displayNames = ['th' => 'ไทย', 'en' => 'English'];

        foreach ($displayNames as $code => $displayName) {
            Locale::updateOrCreate(['code' => $code], ['display_name' => $displayName]);
        }
    }
}
