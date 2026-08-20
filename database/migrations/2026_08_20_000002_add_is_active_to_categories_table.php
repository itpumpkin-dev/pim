<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks whether a category is actually in use — distinct from simply
 * existing in the tree. Defaults true so nothing already in the catalog
 * silently disappears from anywhere that later starts filtering on this;
 * it's meant to be set explicitly (see CategoryController's reconciliation
 * against a known-good reference list, e.g. the real WooCommerce category
 * set), not to change any existing category's visibility on its own.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->after('display_type');
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn('is_active');
        });
    }
};
