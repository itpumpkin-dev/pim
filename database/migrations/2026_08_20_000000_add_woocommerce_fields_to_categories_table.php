<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fields matching WooCommerce's own "Add new category" form (Slug, Display
 * type, Thumbnail) — see the categories create/edit pages. Local metadata
 * only for now, not synced anywhere; `display_type` stores WooCommerce's own
 * literal values ('default'/'products'/'subcategories'/'both') so this stays
 * directly reusable if a category-push feature is built later, without
 * implying that feature exists yet.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->string('slug')->nullable()->after('name');
            $table->string('display_type', 20)->default('default')->after('slug');
            $table->string('thumbnail')->nullable()->after('display_type');
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn(['slug', 'display_type', 'thumbnail']);
        });
    }
};
