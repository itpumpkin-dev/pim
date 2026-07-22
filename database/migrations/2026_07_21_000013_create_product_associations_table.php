<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_associations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('owner_product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('associated_product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('association_type_id')->constrained('association_types')->cascadeOnDelete();

            $table->unique(
                ['owner_product_id', 'associated_product_id', 'association_type_id'],
                'uq_product_associations_scope'
            );
            $table->index('associated_product_id', 'idx_product_associations_associated_product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_associations');
    }
};
