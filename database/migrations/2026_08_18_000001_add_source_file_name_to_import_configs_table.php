<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('import_configs', function (Blueprint $table) {
            $table->string('source_file_name')->nullable()->after('source_file_path');
        });
    }

    public function down(): void
    {
        Schema::table('import_configs', function (Blueprint $table) {
            $table->dropColumn('source_file_name');
        });
    }
};
