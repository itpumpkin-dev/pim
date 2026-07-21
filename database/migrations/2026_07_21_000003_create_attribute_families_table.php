<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attribute_families', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('created_by', 'idx_attribute_families_created_by');
            $table->index('updated_by', 'idx_attribute_families_updated_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_families');
    }
};
