<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_fields', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('type', 50);
            $table->boolean('is_required')->default(false);
            $table->boolean('value_per_locale')->default(false);
            $table->boolean('status')->default(true);
            $table->integer('position')->default(0);
            $table->string('display_section', 100)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('created_by', 'idx_category_fields_created_by');
            $table->index('updated_by', 'idx_category_fields_updated_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('category_fields');
    }
};
