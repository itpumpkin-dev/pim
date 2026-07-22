<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locales', function (Blueprint $table) {
            $table->string('display_name', 100)->nullable()->after('code');
            $table->boolean('enabled')->default(true)->after('display_name');
        });
    }

    public function down(): void
    {
        Schema::table('locales', function (Blueprint $table) {
            $table->dropColumn(['display_name', 'enabled']);
        });
    }
};
