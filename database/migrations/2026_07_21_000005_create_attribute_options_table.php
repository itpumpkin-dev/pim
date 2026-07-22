<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attribute_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_id')->constrained('attributes')->cascadeOnDelete();
            $table->string('code', 100);

            $table->unique(['attribute_id', 'code'], 'uq_attribute_options_attribute_code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_options');
    }
};
