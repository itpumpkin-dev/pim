<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fixes a real bug found via code review: LazadaProductSyncService::
 * resolveGenericBrandName() (the `brand` field's "either Master Brand page
 * or this generic Attribute Mapping page" resolution) used to look up the
 * chosen option's NAME from `lazada_attributes.options` — a single row keyed
 * only by attribute `name`, shared across every Lazada category. Any later
 * sync of a *different* category that also has a `brand` attribute silently
 * overwrote that row's option list, so a product mapped against an earlier
 * category's option ids could end up resolving to nothing (and falling back
 * to sending the raw numeric id string to Lazada instead of a real name).
 *
 * Fix: capture the option's label at the moment the admin picks it (the
 * frontend already has it — it's the same list rendered in the dropdown),
 * store it right alongside `lazada_option_value` on this table, and stop
 * depending on the global, mutable `options` cache for this at push time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lazada_attribute_option_mappings', function (Blueprint $table) {
            $table->string('lazada_option_label')->nullable()->after('lazada_option_value');
        });
    }

    public function down(): void
    {
        Schema::table('lazada_attribute_option_mappings', function (Blueprint $table) {
            $table->dropColumn('lazada_option_label');
        });
    }
};
