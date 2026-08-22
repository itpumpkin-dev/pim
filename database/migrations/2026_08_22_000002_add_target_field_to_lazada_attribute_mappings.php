<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Brings lazada_attribute_mappings up to shopee_attribute_mappings' shape
 * (2026_08_22_000001) — `target_field` lets an admin map a PIM attribute
 * into one of Lazada's structured payload fields (name/price/qty/weight/
 * length/width/height/video), not just a custom category-attribute entry —
 * see LazadaProductSyncService::buildPayload(), which replaces its old
 * hardcoded pname/price_std/qty/attribute_6/SKU_FIELD_SOURCE lookups with
 * this mapping.
 *
 * Every existing row here already represents a custom Lazada attribute
 * mapping (the only kind that existed before this column, including two
 * rows already targeting Lazada's own real "description"/"short_description"
 * category attributes) — backfilled to target_field='lazada_attribute',
 * unchanged in effect.
 *
 * `video` is intentionally included in the defaults below (attribute_6 is
 * this app's one `type=video` PIM attribute) but LazadaAttributeMappingController
 * enforces that only a type=video attribute can ever be saved against this
 * target — video was previously mappable through the general mechanism and
 * broke a real push (BIZ_CHECK_EXTERNAL_VIDEO_IS_FORBIDDEN) when mapped to
 * the wrong kind of attribute; this guard is what makes that safe to reopen.
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
        ['code' => 'attribute_6', 'target_field' => 'video'],
    ];

    public function up(): void
    {
        Schema::table('lazada_attribute_mappings', function (Blueprint $table) {
            $table->string('target_field')->nullable()->after('attribute_id');
        });

        DB::table('lazada_attribute_mappings')->update(['target_field' => 'lazada_attribute']);

        foreach (self::STRUCTURED_DEFAULTS as $default) {
            $attributeId = DB::table('attributes')->where('code', $default['code'])->value('id');

            if (!$attributeId) {
                continue;
            }

            $alreadyMapped = DB::table('lazada_attribute_mappings')->where('attribute_id', $attributeId)->exists();
            if ($alreadyMapped) {
                continue;
            }

            DB::table('lazada_attribute_mappings')->insert([
                'attribute_id' => $attributeId,
                'target_field' => $default['target_field'],
                'sort_order' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Writing straight to the table (not through the Eloquent model)
        // never invalidates LazadaAttributeMapping::cachedList()'s versioned
        // cache — a request that already warmed it before this migration ran
        // would keep serving the pre-migration snapshot (missing
        // target_field entirely) until something bumps the version. Confirmed
        // live: this exact gap left TikTokAttributeMapping's cache stale
        // after its own equivalent migration.
        \App\Models\LazadaAttributeMapping::bumpListVersion();
    }

    public function down(): void
    {
        $codes = array_column(self::STRUCTURED_DEFAULTS, 'code');
        $attributeIds = DB::table('attributes')->whereIn('code', $codes)->pluck('id');

        DB::table('lazada_attribute_mappings')->whereIn('attribute_id', $attributeIds)->delete();

        Schema::table('lazada_attribute_mappings', function (Blueprint $table) {
            $table->dropColumn('target_field');
        });

        \App\Models\LazadaAttributeMapping::bumpListVersion();
    }
};
