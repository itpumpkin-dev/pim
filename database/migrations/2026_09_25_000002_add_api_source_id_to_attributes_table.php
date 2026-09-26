<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A `select`/`multiselect` attribute can bind to an AttributeApiSource
     * instead of (never both with) a master_source — see
     * AttributeController::store()/update() for the mutual-exclusivity
     * enforcement and App\Services\Catalog\ApiAttributeOptionSync for the
     * sync itself.
     */
    public function up(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->foreignId('api_source_id')->nullable()->after('master_source')
                ->constrained('attribute_api_sources')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('api_source_id');
        });
    }
};
