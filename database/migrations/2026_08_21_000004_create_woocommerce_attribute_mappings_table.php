<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Lets an admin choose which PIM attributes feed into WooCommerce's
 * `description`/`short_description` fields, in what order — see
 * WooCommerceProductSyncService::buildContentFields(), which replaces the
 * single hardcoded `product_details_features` lookup buildPayload() used to
 * have. Seeded with that same attribute as the default `description`
 * mapping below so existing push behavior doesn't go blank for every other
 * product between this deploy and an admin configuring the new mapping page.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('woocommerce_attribute_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_id')->unique()->constrained('attributes')->cascadeOnDelete();
            $table->string('target_field'); // 'description' | 'short_description'
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        $attributeId = DB::table('attributes')->where('code', 'product_details_features')->value('id');

        if ($attributeId) {
            DB::table('woocommerce_attribute_mappings')->insert([
                'attribute_id' => $attributeId,
                'target_field' => 'description',
                'sort_order' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('woocommerce_attribute_mappings');
    }
};
