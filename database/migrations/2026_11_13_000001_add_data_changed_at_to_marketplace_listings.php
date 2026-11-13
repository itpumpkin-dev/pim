<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * marketplace_listings.data_changed_at — when the listing's synced data (sku / name / status /
 * active / price / qty / image / url) last actually changed. last_synced_at and updated_at are
 * both rewritten on every sync, so neither can say that. Set by
 * MarketplaceListingSyncService::flush() only when a value differs; existing rows start at
 * created_at (first seen — nothing earlier is known).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketplace_listings', function (Blueprint $table) {
            $table->timestamp('data_changed_at')->nullable()->after('last_synced_at');
        });

        DB::table('marketplace_listings')->update(['data_changed_at' => DB::raw('created_at')]);
    }

    public function down(): void
    {
        Schema::table('marketplace_listings', function (Blueprint $table) {
            $table->dropColumn('data_changed_at');
        });
    }
};
