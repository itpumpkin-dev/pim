<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Local cache of Shopee's attribute schema (v2.product.get_attribute_tree),
     * deduped by attribute_id — confirmed live 2026-08-14 to be global/stable
     * across categories, same assumption ShopeeProductSyncService's old
     * hardcoded SHOPEE_ATTRIBUTE_SOURCE const already made. See
     * ShopeeAttributeMappingController::syncShopeeAttributes().
     *
     * shopee_attribute_mappings mirrors woocommerce_attribute_mappings but
     * simplified: Shopee v1 only supports free-text attributes (input_type
     * FREE_TEXT_FILED = 3), so there is no target_field/content-vs-structured
     * split — a PIM attribute either maps to one Shopee attribute or it
     * doesn't.
     */
    public function up(): void
    {
        Schema::create('shopee_attributes', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            // 1=SINGLE_DROP_DOWN, 2=SINGLE_COMBO_BOX, 3=FREE_TEXT_FILED,
            // 4=MULTI_DROP_DOWN, 5=MULTI_COMBO_BOX. Only 3 is mappable in v1
            // (see WooCommerceAttributeMappingController-equivalent's
            // update() validation) — the rest are synced for visibility only.
            $table->unsignedTinyInteger('input_type')->nullable();
            $table->timestamps();
        });

        Schema::create('shopee_attribute_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_id')->unique()->constrained('attributes')->cascadeOnDelete();
            $table->unsignedBigInteger('shopee_attribute_id')->nullable();
            $table->foreign('shopee_attribute_id')->references('id')->on('shopee_attributes')->nullOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shopee_attribute_mappings');
        Schema::dropIfExists('shopee_attributes');
    }
};
