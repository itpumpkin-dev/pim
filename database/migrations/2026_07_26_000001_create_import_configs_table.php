<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('import_configs', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('type', 50);
            $table->string('file_format', 10)->default('csv');
            $table->string('field_separator', 5)->default(',');
            $table->string('action', 20)->default('create_update');
            $table->string('validation_strategy', 20)->default('skip_errors');
            $table->unsignedInteger('allowed_errors')->default(10);
            $table->string('image_directory_path')->nullable();
            $table->string('source_file_path')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('import_configs');
    }
};
