<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** "สถานะทำงาน" toggle for a Points row. */
    public function up(): void
    {
        Schema::table('points', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->after('point_ratio');
        });
    }

    public function down(): void
    {
        Schema::table('points', function (Blueprint $table) {
            $table->dropColumn('is_active');
        });
    }
};
