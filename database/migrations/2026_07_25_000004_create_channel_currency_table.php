<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('channel_currency', function (Blueprint $table) {
            $table->id();
            $table->foreignId('channel_id')->constrained('channels')->cascadeOnDelete();
            $table->foreignId('currency_id')->constrained('currencies')->cascadeOnDelete();

            $table->unique(['channel_id', 'currency_id'], 'uq_channel_currency_channel_currency');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('channel_currency');
    }
};
