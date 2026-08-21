<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tiktok_brands', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->timestamps();
        });

        Schema::table('attribute_options', function (Blueprint $table) {
            $table->unsignedBigInteger('tiktok_brand_id')->nullable()->after('lazada_brand_id');
            $table->foreign('tiktok_brand_id')->references('id')->on('tiktok_brands')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tiktok_brand_id');
        });

        Schema::dropIfExists('tiktok_brands');
    }
};
