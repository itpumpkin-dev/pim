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
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->string('admin_label')->nullable()->after('code');
            $table->string('swatch_value')->nullable()->after('admin_label');
            $table->unsignedInteger('sort_order')->default(0)->after('swatch_value');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->dropColumn(['admin_label', 'swatch_value', 'sort_order']);
        });
    }
};
