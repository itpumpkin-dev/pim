<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Local read-only cache of WooCommerce's global Product Attributes
 * taxonomy (pa_color, pa_material, ...) — see
 * WooCommerceAttributeMappingController::syncWoocommerceAttributes() for
 * how this is populated from WooCommerceClient::getAttributes(). Same
 * non-incrementing-PK shape as woocommerce_brands/woocommerce_categories:
 * `id` is WooCommerce's own real attribute id, not a locally-generated one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('woocommerce_attributes', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->string('type')->nullable();
            $table->timestamps();
        });

        Schema::table('woocommerce_attribute_mappings', function (Blueprint $table) {
            $table->unsignedBigInteger('woocommerce_attribute_id')->nullable()->after('target_field');
            $table->foreign('woocommerce_attribute_id')->references('id')->on('woocommerce_attributes')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('woocommerce_attribute_mappings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('woocommerce_attribute_id');
        });

        Schema::dropIfExists('woocommerce_attributes');
    }
};
