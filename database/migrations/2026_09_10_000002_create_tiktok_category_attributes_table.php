<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror of `2026_09_07_000003_create_lazada_category_attributes_table` for
 * TikTok — see `App\Models\TikTokCategoryAttribute`'s docblock for the bug
 * this fixes. Unlike that Lazada migration, there is no pre-existing/
 * uncommitted-drift situation here to work around — this is a normal fresh
 * migration, still guarded with `hasTable()` for the same cheap safety.
 *
 * `tiktok_attribute_id` is `string` to match `tiktok_attributes.id`'s own
 * column type (TikTok's attribute id, unlike Shopee's, is a string — see
 * `2026_08_21_000009_create_tiktok_attribute_mapping_tables`'s docblock).
 * That same docblock already flags the open question this table sidesteps
 * rather than resolves: TikTokProductSyncService's own docblock calls
 * TikTok attribute ids "category-specific, unlike Shopee's attribute ids,
 * which are global" — unconfirmed either way. A composite PK of
 * (category_id, tiktok_attribute_id) does not require `id` to be globally
 * unique to be correct — it only requires the *pair* to be unique, which
 * holds regardless of whether the same id string happens to mean the same
 * schema field in two different categories or not. So this table is safe
 * either way; `tiktok_attributes` itself (deduped globally by `id`, see its
 * own docblock) is the one that would need revisiting if same-id-different-
 * category collisions are ever actually observed.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tiktok_category_attributes')) {
            return;
        }

        Schema::create('tiktok_category_attributes', function (Blueprint $table) {
            $table->unsignedBigInteger('category_id');
            $table->string('tiktok_attribute_id');
            $table->boolean('mandatory')->default(false);
            $table->timestamps();

            $table->primary(['category_id', 'tiktok_attribute_id']);
            $table->foreign('category_id')->references('id')->on('tiktok_categories')->cascadeOnDelete();
            $table->foreign('tiktok_attribute_id')->references('id')->on('tiktok_attributes')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tiktok_category_attributes');
    }
};
