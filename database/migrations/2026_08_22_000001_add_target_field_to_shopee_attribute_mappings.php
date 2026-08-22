<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Brings shopee_attribute_mappings up to woocommerce_attribute_mappings'
 * shape — `target_field` lets an admin map a PIM attribute into one of
 * Shopee's structured payload fields (name/price/qty/weight/length/width/
 * height/description/video), not just a custom `attribute_list` entry —
 * see ShopeeProductSyncService::buildPayload(), which replaces its old
 * hardcoded pname/price_std/qty/weight_pcs/product_details_features/
 * attribute_6/length_pcs/width_pcs/height_pcs lookups with this mapping.
 *
 * Every existing row here already represents a custom Shopee attribute
 * mapping (the only kind that existed before this column) — backfilled to
 * target_field='shopee_attribute', the same value ShopeeAttributeMappingController
 * now requires alongside shopee_attribute_id.
 *
 * The 9 structured-field defaults below reproduce exactly what buildPayload()
 * hardcoded before this change, so existing push output doesn't regress
 * between this deploy and an admin configuring the mapping page — same
 * reasoning as 2026_08_21_000005_seed_woocommerce_structured_field_mappings.
 */
return new class extends Migration
{
    private const STRUCTURED_DEFAULTS = [
        ['code' => 'pname', 'target_field' => 'name'],
        ['code' => 'price_std', 'target_field' => 'price'],
        ['code' => 'qty', 'target_field' => 'qty'],
        ['code' => 'weight_pcs', 'target_field' => 'weight'],
        ['code' => 'length_pcs', 'target_field' => 'length'],
        ['code' => 'width_pcs', 'target_field' => 'width'],
        ['code' => 'height_pcs', 'target_field' => 'height'],
        ['code' => 'product_details_features', 'target_field' => 'description'],
        ['code' => 'attribute_6', 'target_field' => 'video'],
    ];

    public function up(): void
    {
        Schema::table('shopee_attribute_mappings', function (Blueprint $table) {
            $table->string('target_field')->nullable()->after('attribute_id');
        });

        DB::table('shopee_attribute_mappings')->update(['target_field' => 'shopee_attribute']);

        foreach (self::STRUCTURED_DEFAULTS as $default) {
            $attributeId = DB::table('attributes')->where('code', $default['code'])->value('id');

            if (!$attributeId) {
                continue;
            }

            $alreadyMapped = DB::table('shopee_attribute_mappings')->where('attribute_id', $attributeId)->exists();
            if ($alreadyMapped) {
                continue;
            }

            DB::table('shopee_attribute_mappings')->insert([
                'attribute_id' => $attributeId,
                'target_field' => $default['target_field'],
                'sort_order' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Writing straight to the table (not through the Eloquent model)
        // never invalidates ShopeeAttributeMapping::cachedList()'s versioned
        // cache — a request that already warmed it before this migration ran
        // would keep serving the pre-migration snapshot (missing
        // target_field entirely) until something bumps the version. Confirmed
        // live: this exact gap left TikTokAttributeMapping's cache stale
        // after its own equivalent migration.
        \App\Models\ShopeeAttributeMapping::bumpListVersion();
    }

    public function down(): void
    {
        $codes = array_column(self::STRUCTURED_DEFAULTS, 'code');
        $attributeIds = DB::table('attributes')->whereIn('code', $codes)->pluck('id');

        DB::table('shopee_attribute_mappings')->whereIn('attribute_id', $attributeIds)->delete();

        Schema::table('shopee_attribute_mappings', function (Blueprint $table) {
            $table->dropColumn('target_field');
        });

        \App\Models\ShopeeAttributeMapping::bumpListVersion();
    }
};
