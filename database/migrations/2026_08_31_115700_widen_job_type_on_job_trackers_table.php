<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `job_type` started as a 10-char column for exactly 'import'/'export'.
 * The standalone translation tracker adds a third value, 'translation'
 * (11 chars), so the column needs a little more room.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_trackers', function (Blueprint $table) {
            $table->string('job_type', 20)->change();
        });
    }

    public function down(): void
    {
        Schema::table('job_trackers', function (Blueprint $table) {
            $table->string('job_type', 10)->change();
        });
    }
};
