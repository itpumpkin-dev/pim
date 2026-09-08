<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pure UI-organization marker — lets role-form.tsx's "Attribute Access"
 * permission section split a group that came from a marketplace sync
 * (currently just the shared "Lazada" group — see
 * LazadaAttributeFamilyGenerator::findOrCreateLazadaGroup()) into its own
 * "Platform Attribute Access" table instead of the flat, ever-growing
 * general list. Deliberately NOT a new permission resource — the same
 * `view_attribute_groups`/`edit_attribute_groups` role_permissions rows
 * still govern access either way (see AttributeAccessPolicy, unchanged);
 * this column only decides which table a group renders in.
 *
 * Soft reference to `sales_platforms.code` (the existing lookup already
 * seeded with lazada/shopee/tiktok/woocommerce, used elsewhere e.g.
 * sales_platform_shops.sales_platform_id) rather than inventing a fresh
 * enum.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attribute_groups', function (Blueprint $table) {
            $table->string('platform')->nullable()->after('name');
            $table->foreign('platform')->references('code')->on('sales_platforms')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attribute_groups', function (Blueprint $table) {
            $table->dropForeign(['platform']);
            $table->dropColumn('platform');
        });
    }
};
