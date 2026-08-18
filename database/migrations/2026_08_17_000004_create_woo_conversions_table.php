<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('woo_conversions', function (Blueprint $table) {
            $table->id();
            $table->string('original_filename');
            $table->unsignedInteger('row_count')->default(0);
            $table->unsignedInteger('sku_missing_count')->default(0);
            $table->unsignedInteger('category_matched_count')->default(0);
            $table->unsignedInteger('category_unmatched_count')->default(0);
            $table->json('type_warnings')->nullable();
            $table->unsignedInteger('type_warnings_total')->default(0);
            $table->boolean('emitted_name')->default(true);
            $table->boolean('emitted_description')->default(true);
            $table->boolean('has_unmatched')->default(false);
            $table->string('family_code')->nullable();
            $table->string('converted_file_path');
            $table->string('unmatched_file_path')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('woo_conversions');
    }
};
