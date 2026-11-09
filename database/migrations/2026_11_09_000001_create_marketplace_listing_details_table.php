<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Full product detail of one marketplace listing ITEM on one shop, fetched on
 * demand (Product Matching "รายละเอียด" dialog) or in bulk
 * (`marketplace:fetch-listing-details`) by MarketplaceListingDetailService —
 * read-only API calls only. One row per (shop, item_id): every variant row
 * of that item in marketplace_listings shares it (joined on
 * sales_platform_shop_id + item_id — deliberately not a FK, the listing rows
 * are re-created/deleted by every listing sync).
 *
 * Normalised columns (same shape for every platform — see
 * App\Services\Marketplace\Listings\Details\MarketplaceListingDetailFetcher):
 *   description       as received (HTML for Lazada/TikTok/WooCommerce, plain
 *                     text for Shopee)
 *   description_text  HTML stripped to readable text with line breaks — what
 *                     the UI shows (never render `description` as HTML)
 *   images            ordered list of image URLs
 *   attributes        [{id, name, values: [..]}]
 *   package           {weight_kg, length_cm, width_cm, height_cm} — converted
 *                     from each platform's own units, members nullable
 *   variants          [{variant_id, seller_sku, name, options: {name: value},
 *                     price, special_price, quantity, status, image}]
 *   raw               the untouched API responses keyed by endpoint (for a
 *                     later import into PIM / comparison report)
 * A failed refresh keeps the previous good data and only sets fetch_error.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketplace_listing_details', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_platform_shop_id')->constrained('sales_platform_shops')->cascadeOnDelete();
            $table->string('platform', 20);
            $table->string('item_id');
            $table->text('name')->nullable();
            $table->text('description')->nullable();
            $table->text('description_text')->nullable();
            $table->string('brand_id')->nullable();
            $table->string('brand_name')->nullable();
            $table->string('category_id')->nullable();
            $table->string('category_name')->nullable();
            $table->jsonb('images')->nullable();
            $table->text('video_url')->nullable();
            $table->jsonb('attributes')->nullable();
            $table->jsonb('package')->nullable();
            $table->jsonb('variants')->nullable();
            $table->string('status')->nullable();
            $table->text('listing_url')->nullable();
            $table->jsonb('raw')->nullable();
            $table->timestamp('fetched_at')->nullable();
            $table->text('fetch_error')->nullable();
            $table->unsignedInteger('fetch_duration_ms')->nullable();
            $table->timestamps();

            $table->unique(['sales_platform_shop_id', 'item_id']);
            $table->index(['platform', 'fetched_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_listing_details');
    }
};
