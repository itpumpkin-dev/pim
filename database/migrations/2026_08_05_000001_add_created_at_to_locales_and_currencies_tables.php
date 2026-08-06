<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locales', function (Blueprint $table) {
            $table->timestamp('created_at')->nullable();
        });
        Schema::table('currencies', function (Blueprint $table) {
            $table->timestamp('created_at')->nullable();
        });

        // Backfill existing seed rows to a date in the past so the dashboard's
        // "trend vs 7 days ago" comparison doesn't read pre-existing data as
        // newly created this week.
        $backdated = now()->subDays(90);
        DB::table('locales')->whereNull('created_at')->update(['created_at' => $backdated]);
        DB::table('currencies')->whereNull('created_at')->update(['created_at' => $backdated]);
    }

    public function down(): void
    {
        Schema::table('locales', function (Blueprint $table) {
            $table->dropColumn('created_at');
        });
        Schema::table('currencies', function (Blueprint $table) {
            $table->dropColumn('created_at');
        });
    }
};
