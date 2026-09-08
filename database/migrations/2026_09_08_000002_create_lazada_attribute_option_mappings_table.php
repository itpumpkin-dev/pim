<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The piece that was missing for singleSelect/multiSelect/enumInput/
 * multiEnumInput Lazada attributes: lazada_attribute_mappings alone only
 * says "this PIM attribute feeds that Lazada attribute" — for a free-value
 * input_type (text/numeric/richText) that's the whole story, but a
 * select-type one also needs, for every one of the PIM attribute's own
 * AttributeOption rows, which of Lazada's predefined
 * lazada_attribute_options.value it corresponds to. One row here is one such
 * pairing.
 *
 * Scoped to lazada_attribute_mapping_id (not attribute_id directly) because
 * the pairing only makes sense once a source PIM attribute has actually been
 * chosen for a specific Lazada attribute — deleting that parent mapping
 * (LazadaAttributeMappingController::update() clearing target_field) cascades
 * here too, same as attribute_option_id disappearing if the PIM option itself
 * is deleted.
 *
 * No dedicated master-table precedent to mirror here (Brand's
 * lazada_brand_id column works because pbrand has exactly one shared catalog
 * of ~153k Lazada brands — see ResolvesProductAttributeValues::
 * mappedBrandOptionId()'s docblock) — every other Lazada category attribute
 * has its own small, attribute-specific value list instead, hence a generic
 * junction table rather than another dedicated column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lazada_attribute_option_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lazada_attribute_mapping_id')->constrained('lazada_attribute_mappings')->cascadeOnDelete();
            $table->foreignId('attribute_option_id')->constrained('attribute_options')->cascadeOnDelete();
            $table->string('lazada_option_value');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['lazada_attribute_mapping_id', 'attribute_option_id'], 'uq_lazada_option_mapping_target_option');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lazada_attribute_option_mappings');
    }
};
