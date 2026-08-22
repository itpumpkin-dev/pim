<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Brings tiktok_attribute_mappings up to shopee_attribute_mappings' shape
 * (2026_08_22_000001) — `target_field` lets an admin map a PIM attribute
 * into one of TikTok's structured payload fields (name/price/qty/weight/
 * length/width/height/description/video), not just a custom product-
 * attribute entry — see TikTokProductSyncService::buildPayload(), which
 * replaces its old hardcoded pname/price_std/qty/weight_pcs/
 * product_details_features/attribute_6/DIMENSION_FIELD_SOURCE lookups with
 * this mapping.
 *
 * Every existing row here already represents a custom TikTok attribute
 * mapping (the only kind that existed before this column) — backfilled to
 * target_field='tiktok_attribute'.
 *
 * `video` is intentionally included in the defaults below (attribute_6 is
 * this app's one `type=video` PIM attribute) but TikTokAttributeMappingController
 * enforces that only a type=video attribute can ever be saved against this
 * target — same safety guard added for Lazada's identical attribute_6-vs-
 * youtube_url shape (see that migration's docblock for the live incident
 * this prevents a repeat of).
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
        Schema::table('tiktok_attribute_mappings', function (Blueprint $table) {
            $table->string('target_field')->nullable()->after('attribute_id');
        });

        DB::table('tiktok_attribute_mappings')->update(['target_field' => 'tiktok_attribute']);

        foreach (self::STRUCTURED_DEFAULTS as $default) {
            $attributeId = DB::table('attributes')->where('code', $default['code'])->value('id');

            if (!$attributeId) {
                continue;
            }

            $alreadyMapped = DB::table('tiktok_attribute_mappings')->where('attribute_id', $attributeId)->exists();
            if ($alreadyMapped) {
                continue;
            }

            DB::table('tiktok_attribute_mappings')->insert([
                'attribute_id' => $attributeId,
                'target_field' => $default['target_field'],
                'sort_order' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Writing straight to the table (not through the Eloquent model)
        // never invalidates TikTokAttributeMapping::cachedList()'s versioned
        // cache — confirmed live: a request that had already warmed this
        // cache before this migration ran kept serving the pre-migration
        // snapshot (5 rows, no target_field at all) instead of the real 14
        // rows this migration produced, until this bump.
        \App\Models\TikTokAttributeMapping::bumpListVersion();
    }

    public function down(): void
    {
        $codes = array_column(self::STRUCTURED_DEFAULTS, 'code');
        $attributeIds = DB::table('attributes')->whereIn('code', $codes)->pluck('id');

        DB::table('tiktok_attribute_mappings')->whereIn('attribute_id', $attributeIds)->delete();

        Schema::table('tiktok_attribute_mappings', function (Blueprint $table) {
            $table->dropColumn('target_field');
        });

        \App\Models\TikTokAttributeMapping::bumpListVersion();
    }
};
