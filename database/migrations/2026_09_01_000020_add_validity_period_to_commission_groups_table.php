<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** "ช่วงเวลา" — the date range a commission group is valid/usable for. Either end may be left open. */
    public function up(): void
    {
        Schema::table('commission_groups', function (Blueprint $table) {
            $table->date('start_date')->nullable()->after('divisor_secondary');
            $table->date('end_date')->nullable()->after('start_date');
        });
    }

    public function down(): void
    {
        Schema::table('commission_groups', function (Blueprint $table) {
            $table->dropColumn(['start_date', 'end_date']);
        });
    }
};
