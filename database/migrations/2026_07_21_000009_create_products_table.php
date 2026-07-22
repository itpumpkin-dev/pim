<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('sku', 100)->unique();
            $table->foreignId('family_id')->nullable()->constrained('attribute_families')->nullOnDelete();
            $table->string('type', 50)->default('simple');
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->index('family_id', 'idx_products_family_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
