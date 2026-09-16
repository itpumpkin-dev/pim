<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A role with zero rows here for a given platform is unrestricted (sees/
     * operates on every shop of that platform) — this table is opt-in
     * whitelisting only, never a blocklist. See Role::allowedShopIdsFor()
     * and User::canAccessShop().
     */
    public function up(): void
    {
        Schema::create('role_sales_platform_shop', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sales_platform_shop_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['role_id', 'sales_platform_shop_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_sales_platform_shop');
    }
};
