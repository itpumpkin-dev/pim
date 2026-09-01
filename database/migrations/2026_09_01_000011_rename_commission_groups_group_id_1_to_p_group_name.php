<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `group_id_1` never meant "a secondary id" — it holds PGroupName (the
     * commission group's display name, e.g. "G1.1", "Power Tools"). Renamed
     * to `p_group_name` to say what it actually is.
     */
    public function up(): void
    {
        Schema::table('commission_groups', function (Blueprint $table) {
            $table->renameColumn('group_id_1', 'p_group_name');
        });
    }

    public function down(): void
    {
        Schema::table('commission_groups', function (Blueprint $table) {
            $table->renameColumn('p_group_name', 'group_id_1');
        });
    }
};
