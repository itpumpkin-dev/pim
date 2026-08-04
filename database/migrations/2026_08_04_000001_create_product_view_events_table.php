<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_view_events', function (Blueprint $table) {
            $table->id();
            $table->string('event_type', 20);
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('category', 150)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('session_id', 100)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index('event_type', 'idx_product_view_events_event_type');
            $table->index('product_id', 'idx_product_view_events_product_id');
            $table->index('category', 'idx_product_view_events_category');
            $table->index('user_id', 'idx_product_view_events_user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_view_events');
    }
};
