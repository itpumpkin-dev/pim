<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Same reasoning as 2026_08_24_104607's shopee_attributes columns of the
 * same name (mirrored again for Lazada in 2026_08_25_013412) —
 * tiktok_attributes was built assuming the schema (name/is_customizable/
 * is_multiple_selection) is global and stable across categories (see
 * TikTokAttributeMappingController::syncTikTokAttributes()'s docblock), and
 * that method only ever covered PIM-mapped categories, so a category never
 * PIM-mapped had none of its attributes cached. `mandatory` wasn't tracked
 * at all — TikTok's Get Attributes response carries a live `is_requried`
 * flag per attribute (confirmed against the real API docs) that was never
 * persisted anywhere for this table.
 *
 * `category_id` here is the same "informational, last category this row was
 * seen under" compromise shopee_attributes.category_id/
 * lazada_attributes.category_id already make.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tiktok_attributes', function (Blueprint $table) {
            $table->unsignedBigInteger('category_id')->nullable()->after('is_multiple_selection');
            $table->boolean('mandatory')->nullable()->after('category_id');

            $table->foreign('category_id')->references('id')->on('tiktok_categories')->nullOnDelete();
            $table->index('category_id');
        });
    }

    public function down(): void
    {
        Schema::table('tiktok_attributes', function (Blueprint $table) {
            $table->dropForeign(['category_id']);
            $table->dropColumn(['category_id', 'mandatory']);
        });
    }
};
