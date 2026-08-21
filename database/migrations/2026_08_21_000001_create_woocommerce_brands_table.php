<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('woocommerce_brands', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->timestamps();
        });

        Schema::table('attribute_options', function (Blueprint $table) {
            $table->unsignedBigInteger('woocommerce_brand_id')->nullable()->after('shopee_brand_id');
            $table->foreign('woocommerce_brand_id')->references('id')->on('woocommerce_brands')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->dropConstrainedForeignId('woocommerce_brand_id');
        });

        Schema::dropIfExists('woocommerce_brands');
    }
};
