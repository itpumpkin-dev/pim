<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tracks real, confirmed-live status per product+shop — separate from
     * the row's own existence, which only means "marked to publish" (see
     * ProductController::update()'s published_shop_ids sync). Populated by
     * a platform-specific sync (LazadaProductSyncService::syncLiveStatus()
     * for Lazada) reading each platform's own live-listing API, not by the
     * publish checkbox. Deliberately added to the existing pivot rather than
     * a new table: any future platform's sync just needs to write these same
     * columns, so the Products list query never needs platform-specific
     * branching.
     */
    public function up(): void
    {
        Schema::table('product_platform_shops', function (Blueprint $table) {
            $table->string('status')->nullable()->after('sales_platform_shop_id');
            $table->string('platform_item_id')->nullable()->after('status');
            $table->timestamp('last_synced_at')->nullable()->after('platform_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('product_platform_shops', function (Blueprint $table) {
            $table->dropColumn(['status', 'platform_item_id', 'last_synced_at']);
        });
    }
};
