<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tracks progress of the AutoTranslateProductValueJob instances a products
 * import with "AI translate" on dispatches — those are separate queued jobs
 * that keep running after ProcessImportJob itself finishes (and reports
 * 'completed'), so without a counter of their own there was no way to tell
 * "how many have translated so far" while they trickle in.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_trackers', function (Blueprint $table) {
            $table->unsignedInteger('total_translations_queued')->default(0)->after('total_rows_processed');
            $table->unsignedInteger('total_translations_completed')->default(0)->after('total_translations_queued');
        });
    }

    public function down(): void
    {
        Schema::table('job_trackers', function (Blueprint $table) {
            $table->dropColumn(['total_translations_queued', 'total_translations_completed']);
        });
    }
};
