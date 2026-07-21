<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attributes', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('type', 50);
            $table->boolean('is_required')->default(false);
            $table->boolean('is_unique')->default(false);
            $table->boolean('is_locale_based')->default(false);
            $table->boolean('is_channel_based')->default(false);
            $table->boolean('is_filterable')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('created_by', 'idx_attributes_created_by');
            $table->index('updated_by', 'idx_attributes_updated_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attributes');
    }
};
