<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Replaces the hard-coded "this master feeds that attribute" wiring
     * (SyncsAttributeOptionMirror's per-controller MIRROR_ATTRIBUTE consts +
     * CategoryAttributeOptionSync's DEPTH_ATTRIBUTES) with a per-attribute
     * `master_source` column an admin picks on the attribute's edit page.
     * Backfills the eight bindings that were previously in code.
     */
    private const BINDINGS = [
        'pcatid' => 'categories',
        'pcatname' => 'categories',
        'psubcatname' => 'subcategories',
        'productgroupname' => 'product_groups',
        'pointtype' => 'points',
        'commission_group' => 'commission_groups',
        'business_type' => 'business_types',
        'vendor' => 'vendors',
        'purchase_currency' => 'currencies',
    ];

    public function up(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->string('master_source', 40)->nullable()->after('swatch_type');
        });

        foreach (self::BINDINGS as $attributeCode => $sourceKey) {
            DB::table('attributes')->where('code', $attributeCode)->update(['master_source' => $sourceKey]);
        }
    }

    public function down(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->dropColumn('master_source');
        });
    }
};
