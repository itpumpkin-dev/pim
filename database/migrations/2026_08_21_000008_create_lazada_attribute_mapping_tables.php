<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Local cache of Lazada's category attribute schema
     * (/category/attributes/get), keyed by the attribute's own `name`
     * string (e.g. "mattress_size") rather than a numeric id — unlike
     * Shopee's attribute_id (confirmed live to be global/stable across
     * categories), Lazada's schema has never shown a reliable numeric id in
     * this codebase; every existing Lazada field match
     * (LazadaProductSyncService::SKU_FIELD_SOURCE,
     * assertMandatoryFieldsPresent()) already keys off the field `name`
     * string instead, so this mirrors that same proven identity.
     *
     * lazada_attribute_mappings mirrors shopee_attribute_mappings: v1 only
     * supports free-value attributes (input_type text/numeric — see
     * LazadaAttributeMappingController), not singleSelect/multiSelect,
     * which need a specific predefined option rather than an arbitrary
     * value.
     */
    public function up(): void
    {
        Schema::create('lazada_attributes', function (Blueprint $table) {
            $table->string('name')->primary();
            $table->string('label')->nullable();
            // Lazada's generally-documented input_type enum (text,
            // singleSelect, multiSelect, numeric, ...) — only "singleSelect"
            // has actually been seen in this codebase so far (a real docs
            // example), so treat any value here as unconfirmed until synced
            // live and observed.
            $table->string('input_type')->nullable();
            // "normal" (payload.attributes) or "sku" (payload.skus[0]) — see
            // LazadaProductSyncService::assertMandatoryFieldsPresent(),
            // which already branches on this same field for validation;
            // buildPayload() uses it too now, to know where a mapped value
            // belongs.
            $table->string('attribute_type')->nullable();
            $table->timestamps();
        });

        Schema::create('lazada_attribute_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_id')->unique()->constrained('attributes')->cascadeOnDelete();
            $table->string('lazada_attribute_name')->nullable();
            $table->foreign('lazada_attribute_name')->references('name')->on('lazada_attributes')->nullOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lazada_attribute_mappings');
        Schema::dropIfExists('lazada_attributes');
    }
};
