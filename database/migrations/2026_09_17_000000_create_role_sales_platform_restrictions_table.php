<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Whether a role has this platform's shop whitelist (role_sales_platform_
     * shop) turned on at all — a row existing here, regardless of how many
     * shops are whitelisted for it, is what makes hasShopRestrictionFor()
     * true. Without this, "restrict to zero shops" and "never configured"
     * were indistinguishable (both were just an empty checkbox list), so
     * unchecking every shop silently fell back to unrestricted instead of
     * blocking the platform entirely. See Role::hasShopRestrictionFor().
     */
    public function up(): void
    {
        Schema::create('role_sales_platform_restrictions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sales_platform_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['role_id', 'sales_platform_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_sales_platform_restrictions');
    }
};
