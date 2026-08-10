<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Designates one role as the effective permission set for visitors who
 * aren't logged in (e.g. the public storefront/product preview pages) —
 * see AttributeAccessPolicy, which previously treated a null viewer as
 * always-allowed unconditionally. A partial unique index (not a plain
 * unique column, since every non-guest role must still be able to store
 * `false`) enforces at most one role can be marked this way at a time.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->boolean('is_guest')->default(false)->after('label');
        });

        DB::statement('CREATE UNIQUE INDEX roles_single_guest_unique ON roles (is_guest) WHERE is_guest = true');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS roles_single_guest_unique');

        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn('is_guest');
        });
    }
};
