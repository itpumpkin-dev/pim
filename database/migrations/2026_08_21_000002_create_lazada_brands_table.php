<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lazada_brands', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->timestamps();
        });

        Schema::table('attribute_options', function (Blueprint $table) {
            $table->unsignedBigInteger('lazada_brand_id')->nullable()->after('woocommerce_brand_id');
            $table->foreign('lazada_brand_id')->references('id')->on('lazada_brands')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->dropConstrainedForeignId('lazada_brand_id');
        });

        Schema::dropIfExists('lazada_brands');
    }
};
