<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Bootstraps a fixed 'woocommerce' SalesPlatform row so it shows up on the
 * Sales Platforms page (catalog/salesPlatforms/index.tsx) like Lazada/
 * Shopee/TikTok, and so WooCommerceConversionController::exportForm() can
 * look its shops up by a known code. Unlike those three, there's no
 * external seller-account source to sync shops from (see WooCommerceExporter's
 * docblock) — an admin adds shops manually via the existing "Add Shop"
 * dialog, each getting its own Channel (SalesPlatformController::
 * ensureChannelFor()) for per-store product value overrides, same as any
 * other platform's shop.
 *
 * Seeded here (once, at deploy time) rather than lazily via firstOrCreate()
 * in exportForm() — that GET route only requires the unrelated
 * woo_conversions permission, so creating a sales_platforms row as a side
 * effect of viewing it would cross a permission boundary users don't
 * actually have.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('sales_platforms')->insertOrIgnore([
            'code' => 'woocommerce',
            'name' => 'WooCommerce',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('sales_platforms')->where('code', 'woocommerce')->delete();
    }
};
