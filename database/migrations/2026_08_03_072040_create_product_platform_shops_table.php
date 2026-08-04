<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_platform_shops', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('sales_platform_shop_id')->constrained('sales_platform_shops')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['product_id', 'sales_platform_shop_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_platform_shops');
    }
};
