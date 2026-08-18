<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('job_trackers', function (Blueprint $table) {
            $table->timestamp('cancel_requested_at')->nullable()->after('completed_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('job_trackers', function (Blueprint $table) {
            $table->dropColumn('cancel_requested_at');
        });
    }
};
