<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Local cache of Lazada's category tree (2,800+ leaf categories), synced
     * from LazadaClient::getCategoryTree(). Kept in our own DB so the
     * category picker doesn't hit Lazada's API on every page load.
     */
    public function up(): void
    {
        Schema::create('lazada_categories', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('name');
            $table->boolean('is_leaf')->default(false);
            $table->timestamps();

            $table->index('parent_id');
        });

        // Self-referencing FK added after the table (and its primary key
        // constraint) is fully committed — Postgres can't resolve a foreign
        // key against a primary key defined in the same CREATE TABLE batch.
        Schema::table('lazada_categories', function (Blueprint $table) {
            $table->foreign('parent_id')->references('id')->on('lazada_categories')->nullOnDelete();
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->unsignedBigInteger('lazada_category_id')->nullable()->after('additional_data');
            $table->foreign('lazada_category_id')->references('id')->on('lazada_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('lazada_category_id');
        });

        Schema::dropIfExists('lazada_categories');
    }
};
