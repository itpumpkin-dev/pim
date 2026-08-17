<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_marketplace_sync_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('sales_platform_shop_id')->constrained('sales_platform_shops')->cascadeOnDelete();
            $table->string('platform', 20);
            $table->string('action', 20);
            $table->string('status', 20)->default('queued');
            $table->text('message')->nullable();
            $table->json('result')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_marketplace_sync_jobs');
    }
};
