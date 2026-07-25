<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('channel_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('channel_id')->constrained('channels')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('name')->nullable();
            $table->timestamps();

            $table->unique(['channel_id', 'locale_id'], 'uq_channel_translations_channel_locale');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('channel_translations');
    }
};
