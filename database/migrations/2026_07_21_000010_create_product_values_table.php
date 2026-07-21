<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('attribute_id')->constrained('attributes')->cascadeOnDelete();
            $table->foreignId('channel_id')->nullable()->constrained('channels')->nullOnDelete();
            $table->foreignId('locale_id')->nullable()->constrained('locales')->nullOnDelete();
            $table->text('value')->nullable();

            $table->index(['product_id', 'attribute_id'], 'idx_product_values_product_attribute');
            $table->index('channel_id', 'idx_product_values_channel_id');
            $table->index('locale_id', 'idx_product_values_locale_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_values');
    }
};
