<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Local cache of TikTok's category attribute schema
     * (/product/202309/categories/{category_id}/attributes), deduped by
     * attribute `id` — TikTokProductSyncService's own docblock flags TikTok
     * attribute ids as "category-specific, unlike Shopee's attribute ids,
     * which are global", unconfirmed either way. Deduping globally by id
     * anyway (same as ShopeeAttribute) is still safe in practice: the actual
     * push-time lookup (TikTokProductSyncService::resolveProductAttributes())
     * always re-fetches the live schema for the product's own category and
     * only ever looks up ids that schema actually returned, so even if the
     * same id meant something different in another category, this table is
     * never consulted cross-category at push time — it only feeds the admin
     * mapping page's picker list. If ids DO turn out to collide with
     * different meanings across categories in practice, this dedup would
     * need revisiting; not yet observed.
     *
     * `id` is a string (TikTok's docs show e.g. "100392" as type string, not
     * int) — mirrors LazadaAttribute's string-PK shape more than
     * ShopeeAttribute's numeric one.
     *
     * tiktok_attribute_mappings mirrors shopee_attribute_mappings: v1 only
     * supports attributes TikTok itself marks `is_customizable` (the seller
     * may type a free value) — see TikTokAttributeMappingController.
     * Attributes that are select-only (`is_customizable: false`, value must
     * come from the fixed `values[]` list) aren't mappable yet, same reason
     * Shopee/Lazada's select-only attributes aren't.
     */
    public function up(): void
    {
        Schema::create('tiktok_attributes', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->boolean('is_customizable')->nullable();
            $table->boolean('is_multiple_selection')->nullable();
            $table->timestamps();
        });

        Schema::create('tiktok_attribute_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_id')->unique()->constrained('attributes')->cascadeOnDelete();
            $table->string('tiktok_attribute_id')->nullable();
            $table->foreign('tiktok_attribute_id')->references('id')->on('tiktok_attributes')->nullOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tiktok_attribute_mappings');
        Schema::dropIfExists('tiktok_attributes');
    }
};
