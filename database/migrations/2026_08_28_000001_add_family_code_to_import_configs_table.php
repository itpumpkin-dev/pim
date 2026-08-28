<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('import_configs', function (Blueprint $table) {
            // Products-only: the Attribute Family every imported row is filed
            // under, chosen once in the import wizard instead of repeated in a
            // per-row `family_code` column. Null keeps the prior behaviour
            // (family taken from the file's own column, or left unset).
            $table->string('family_code')->nullable()->after('source_locale');
        });
    }

    public function down(): void
    {
        Schema::table('import_configs', function (Blueprint $table) {
            $table->dropColumn('family_code');
        });
    }
};
