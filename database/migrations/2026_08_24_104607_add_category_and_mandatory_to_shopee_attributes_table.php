<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * shopee_attributes was built assuming attribute schema (name/input_type) is
 * global and stable across categories (see 2026_08_21_000007's docblock,
 * "confirmed live 2026-08-14") — that part still holds. What it didn't track
 * at all was per-category context: whether an attribute is mandatory is
 * genuinely category-specific (confirmed live: every attribute for category
 * 101192 came back mandatory=false, which says nothing about other
 * categories), and the bulk sync only ever covered PIM-mapped categories, so
 * a category like 101192 — never PIM-mapped — had none of its attributes
 * cached at all despite a real live product needing four of them.
 *
 * `category_id` here is the same "informational, last category this row was
 * seen under" compromise shopee_brands.category_id already makes (see that
 * migration's comment) — an attribute can legitimately appear in several
 * categories, this just isn't tracking the full many-to-many, only "which
 * category to show this row under after its most recent per-category sync".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shopee_attributes', function (Blueprint $table) {
            $table->unsignedBigInteger('category_id')->nullable()->after('input_type');
            $table->boolean('mandatory')->nullable()->after('category_id');

            $table->foreign('category_id')->references('id')->on('shopee_categories')->nullOnDelete();
            $table->index('category_id');
        });
    }

    public function down(): void
    {
        Schema::table('shopee_attributes', function (Blueprint $table) {
            $table->dropForeign(['category_id']);
            $table->dropColumn(['category_id', 'mandatory']);
        });
    }
};
