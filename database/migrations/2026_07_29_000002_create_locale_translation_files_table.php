<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('locale_translation_files', function (Blueprint $table) {
            $table->id();
            $table->string('locale_code', 20);
            $table->string('namespace', 100);
            $table->json('content');
            $table->timestamps();

            $table->unique(['locale_code', 'namespace']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('locale_translation_files');
    }
};
