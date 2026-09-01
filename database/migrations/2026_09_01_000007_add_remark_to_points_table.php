<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Free-text note for a Points row. */
    public function up(): void
    {
        Schema::table('points', function (Blueprint $table) {
            $table->text('remark')->nullable()->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('points', function (Blueprint $table) {
            $table->dropColumn('remark');
        });
    }
};
