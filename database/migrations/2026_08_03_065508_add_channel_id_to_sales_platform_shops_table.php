<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_platform_shops', function (Blueprint $table) {
            // The channel used to scope this shop's product values (price,
            // description, ...) — auto-created/linked by syncLazadaShops()
            // so each shop can carry its own channel-based overrides.
            $table->foreignId('channel_id')->nullable()->after('sales_platform_id')->constrained('channels')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sales_platform_shops', function (Blueprint $table) {
            $table->dropConstrainedForeignId('channel_id');
        });
    }
};
