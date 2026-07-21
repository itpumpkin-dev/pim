<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('family_attributes', function (Blueprint $table) {
            $table->foreignId('family_id')->constrained('attribute_families')->cascadeOnDelete();
            $table->foreignId('attribute_id')->constrained('attributes')->cascadeOnDelete();
            $table->foreignId('attribute_group_id')->constrained('attribute_groups')->cascadeOnDelete();

            $table->primary(['family_id', 'attribute_id']);
            $table->index('attribute_group_id', 'idx_family_attributes_attribute_group_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('family_attributes');
    }
};
