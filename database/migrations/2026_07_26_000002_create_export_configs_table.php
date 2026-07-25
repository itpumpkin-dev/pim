<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('export_configs', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('type', 50);
            $table->string('file_format', 10)->default('csv');
            $table->string('field_separator', 5)->default(',');
            $table->boolean('with_media')->default(false);
            $table->string('result_file_path')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('export_configs');
    }
};
