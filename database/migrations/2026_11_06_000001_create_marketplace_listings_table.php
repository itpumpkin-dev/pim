<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Product Matching (phase 1) — one row per sellable unit that actually exists
 * on a marketplace shop (Lazada SKU / Shopee model / TikTok SKU / WooCommerce
 * variation, or the item itself when it has no variants), regardless of
 * whether it maps to a PIM product. Written by
 * App\Services\Marketplace\Listings\MarketplaceListingSyncService.
 *
 * Keyed by (shop, item_id, variant_id) — NOT seller_sku: the same seller SKU
 * really does appear on several listings within one shop (351 cases seen on
 * Lazada), and pack listings (`15123_5` = 5x PIM 15123) carry their own SKU.
 * variant_id is '' (not NULL) for single-SKU items so the unique index works.
 *
 * product_id/match_* are owned by matching, never by the listing upsert:
 * 'auto_sku' = exact products.sku match (re-evaluated every sync),
 * 'manual'/'pushed' = set by a person / by our own push and never touched by
 * the auto-matcher. pack_quantity is reserved for phase 2 (pack listings).
 *
 * Bundles (one listing → many PIM products, e.g. `50374+50298`) will get a
 * separate pivot table in phase 2 — product_id here is the single-product
 * case only.
 *
 * product_platform_shops (the existing push/link table) is untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketplace_listings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_platform_shop_id')->constrained('sales_platform_shops')->cascadeOnDelete();
            $table->string('platform', 20);
            $table->string('item_id');
            $table->string('variant_id')->default('');
            $table->string('seller_sku')->nullable();
            $table->text('name')->nullable();
            $table->string('status')->nullable();
            $table->boolean('is_active')->default(false);
            $table->decimal('price', 14, 2)->nullable();
            $table->integer('quantity')->nullable();
            $table->text('image_url')->nullable();
            $table->text('url')->nullable();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('match_method', 20)->nullable();
            $table->timestamp('matched_at')->nullable();
            $table->foreignId('matched_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('pack_quantity')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['sales_platform_shop_id', 'item_id', 'variant_id']);
            $table->index('seller_sku');
            $table->index('product_id');
            $table->index(['sales_platform_shop_id', 'product_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_listings');
    }
};
