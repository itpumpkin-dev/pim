<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shopee's version of `2026_09_07_000003_create_lazada_category_attributes_table`
 * — see that migration's docblock and `App\Models\ShopeeAttribute`'s docblock
 * for the full bug this fixes. Short version: `shopee_attributes.category_id`/
 * `.mandatory` hold exactly one shared value per `id` (Shopee's numeric
 * attribute_id), even though the same attribute_id legitimately appears
 * (with a possibly-different mandatory flag) in several Shopee categories —
 * confirmed by `2026_08_24_104607_add_category_and_mandatory_to_shopee_attributes_table`'s
 * own docblock, which already flagged `category_id` there as "informational,
 * last category this row was seen under" rather than a real FK. Re-syncing
 * any other category that happens to share an attribute_id silently
 * overwrites this category's mandatory answer.
 *
 * Unlike the Lazada migration this mirrors, there is no "already ran but
 * never committed" drift to work around here — this is a normal fresh
 * migration, created directly via Schema::create() (still guarded with
 * hasTable() for defensive parity with the rest of this app's marketplace
 * migrations).
 *
 * `shopee_attributes` stays the source of truth for name/input_type/options
 * (Shopee's own schema shape — confirmed stable/global across categories,
 * see that table's migration docblock). This table only ever stores the
 * per-(category, attribute) mandatory flag. Composite PK
 * (category_id, shopee_attribute_id) — written via static::upsert() only
 * (Eloquent has no real composite-PK support), same convention
 * LazadaCategoryAttribute uses.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('shopee_category_attributes')) {
            return;
        }

        Schema::create('shopee_category_attributes', function (Blueprint $table) {
            $table->unsignedBigInteger('category_id');
            $table->unsignedBigInteger('shopee_attribute_id');
            $table->boolean('mandatory')->default(false);
            $table->timestamps();

            $table->primary(['category_id', 'shopee_attribute_id']);
            $table->foreign('category_id')->references('id')->on('shopee_categories')->cascadeOnDelete();
            $table->foreign('shopee_attribute_id')->references('id')->on('shopee_attributes')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shopee_category_attributes');
    }
};
