<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Same reasoning as 2026_08_24_104607's shopee_attributes columns of the
 * same name — lazada_attributes was built assuming the schema (label/
 * input_type/attribute_type) is global and stable across categories (see
 * LazadaAttributeMappingController::syncLazadaAttributes()'s docblock), and
 * that method only ever covered PIM-mapped categories, so a category never
 * PIM-mapped had none of its attributes cached. `mandatory` wasn't tracked
 * at all — see LazadaProductSyncService::assertMandatoryFieldsPresent(),
 * which already reads a live `is_mandatory` flag per field but never
 * persisted it anywhere for this table.
 *
 * `category_id` here is the same "informational, last category this row was
 * seen under" compromise shopee_attributes.category_id already makes — an
 * attribute name can legitimately appear in several categories, this just
 * isn't tracking the full many-to-many, only "which category to show this
 * row under after its most recent per-category sync".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lazada_attributes', function (Blueprint $table) {
            $table->unsignedBigInteger('category_id')->nullable()->after('attribute_type');
            $table->boolean('mandatory')->nullable()->after('category_id');

            $table->foreign('category_id')->references('id')->on('lazada_categories')->nullOnDelete();
            $table->index('category_id');
        });
    }

    public function down(): void
    {
        Schema::table('lazada_attributes', function (Blueprint $table) {
            $table->dropForeign(['category_id']);
            $table->dropColumn(['category_id', 'mandatory']);
        });
    }
};
