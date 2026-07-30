<?php

namespace Database\Seeders;

use App\Models\AssociationType;
use Illuminate\Database\Seeder;

class AssociationTypeSeeder extends Seeder
{
    /**
     * The 3 association types the product edit page's Associations panel
     * offers (Related / Up-sell / Cross-sell), matching UnoPim's naming.
     */
    public function run(): void
    {
        foreach (['related', 'up_sell', 'cross_sell'] as $code) {
            AssociationType::updateOrCreate(['code' => $code]);
        }
    }
}
