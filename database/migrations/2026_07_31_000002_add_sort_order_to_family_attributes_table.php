<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * family_attributes had no ordering column, so the product edit page always
 * rendered attributes in whatever order the DB happened to return them —
 * effectively by attribute_id (the table's primary key is the composite
 * (family_id, attribute_id), so that's the physical row order), never by
 * curated intent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('family_attributes', function (Blueprint $table) {
            $table->unsignedInteger('sort_order')->default(0)->after('attribute_group_id');
        });
    }

    public function down(): void
    {
        Schema::table('family_attributes', function (Blueprint $table) {
            $table->dropColumn('sort_order');
        });
    }
};
