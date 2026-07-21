<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_field_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->foreignId('category_field_id')->constrained('category_fields')->cascadeOnDelete();
            $table->foreignId('locale_id')->nullable()->constrained('locales')->nullOnDelete();
            $table->text('value')->nullable();

            $table->index(['category_id', 'category_field_id'], 'idx_category_field_values_category_field');
            $table->index('locale_id', 'idx_category_field_values_locale_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('category_field_values');
    }
};
