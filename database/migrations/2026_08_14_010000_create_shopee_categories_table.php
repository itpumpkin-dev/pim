<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Local cache of Shopee's category tree (v2.product.get_category),
     * synced from ShopeeClient::getCategoryTree() — mirrors lazada_categories.
     */
    public function up(): void
    {
        Schema::create('shopee_categories', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('name');
            $table->boolean('is_leaf')->default(false);
            $table->timestamps();

            $table->index('parent_id');
        });

        // Self-referencing FK added after the table (and its primary key
        // constraint) is fully committed — same reason as lazada_categories.
        Schema::table('shopee_categories', function (Blueprint $table) {
            $table->foreign('parent_id')->references('id')->on('shopee_categories')->nullOnDelete();
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->unsignedBigInteger('shopee_category_id')->nullable()->after('lazada_category_id');
            $table->foreign('shopee_category_id')->references('id')->on('shopee_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shopee_category_id');
        });

        Schema::dropIfExists('shopee_categories');
    }
};
