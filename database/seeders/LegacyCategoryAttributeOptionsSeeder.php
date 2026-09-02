<?php

namespace Database\Seeders;

use App\Services\Catalog\MasterAttributeOptionSync;
use Illuminate\Database\Seeder;

/**
 * `select` attributes that carry a `master_source` (set by the
 * add_master_source_to_attributes migration) mirror that master's rows as
 * their options instead of an independent CSV-seeded list — see
 * MasterAttributeOptionSync. This seeder does the one-time rebuild of that
 * mirror; from then on model events keep every bound attribute in sync.
 */
class LegacyCategoryAttributeOptionsSeeder extends Seeder
{
    public function run(MasterAttributeOptionSync $sync): void
    {
        $sync->rebuildAll();
    }
}
