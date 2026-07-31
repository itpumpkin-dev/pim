<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * `pcatid` was a free-text field; it's getting a proper dropdown of real
 * category codes (see LegacyCategoryAttributeOptionsSeeder) so it needs to
 * render through the same `select` branch pcatname/psubcatname/
 * productgroupname already use.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('attributes')->where('code', 'pcatid')->update(['type' => 'select']);
    }

    public function down(): void
    {
        DB::table('attributes')->where('code', 'pcatid')->update(['type' => 'text']);
    }
};
