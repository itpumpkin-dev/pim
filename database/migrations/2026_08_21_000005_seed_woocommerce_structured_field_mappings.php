<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Seeds default mappings for the 8 "structured" (single-value,
 * first-match-wins) WooCommerce push fields — name/price/image/qty/weight/
 * length/width/height — reproducing exactly what
 * WooCommerceProductSyncService::buildPayload() hardcoded before this
 * change, so existing push behavior doesn't regress. `price` gets two rows
 * (price_std then price_recommend) to reproduce the old `price_std ??
 * price_recommend` fallback via sort_order — see
 * WooCommerceProductSyncService::resolveMappedField()'s first-match
 * semantics.
 */
return new class extends Migration
{
    private const DEFAULTS = [
        ['code' => 'pname', 'target_field' => 'name', 'sort_order' => 0],
        ['code' => 'price_std', 'target_field' => 'price', 'sort_order' => 0],
        ['code' => 'price_recommend', 'target_field' => 'price', 'sort_order' => 1],
        ['code' => 'pimage', 'target_field' => 'image', 'sort_order' => 0],
        ['code' => 'qty', 'target_field' => 'qty', 'sort_order' => 0],
        ['code' => 'weight_pcs', 'target_field' => 'weight', 'sort_order' => 0],
        ['code' => 'length_pcs', 'target_field' => 'length', 'sort_order' => 0],
        ['code' => 'width_pcs', 'target_field' => 'width', 'sort_order' => 0],
        ['code' => 'height_pcs', 'target_field' => 'height', 'sort_order' => 0],
    ];

    public function up(): void
    {
        foreach (self::DEFAULTS as $default) {
            $attributeId = DB::table('attributes')->where('code', $default['code'])->value('id');

            if (!$attributeId) {
                continue;
            }

            DB::table('woocommerce_attribute_mappings')->insert([
                'attribute_id' => $attributeId,
                'target_field' => $default['target_field'],
                'sort_order' => $default['sort_order'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        $codes = array_column(self::DEFAULTS, 'code');
        $attributeIds = DB::table('attributes')->whereIn('code', $codes)->pluck('id');

        DB::table('woocommerce_attribute_mappings')->whereIn('attribute_id', $attributeIds)->delete();
    }
};
