<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_platform_shops', function (Blueprint $table) {
            // References n8n's tiktok_tokens.id on a separate Postgres
            // instance (see the 'n8n' connection in config/database.php) —
            // no real FK constraint is possible across databases, same
            // cross-database situation as lazada_seller_account_id/
            // shopee_seller_account_id above. unsignedBigInteger, not
            // string, because tiktok_tokens.id is an int4 identity column
            // (like Lazada's, unlike Shopee's string shop_id).
            $table->unsignedBigInteger('tiktok_seller_account_id')->nullable()->after('shopee_seller_account_id');
        });
    }

    public function down(): void
    {
        Schema::table('sales_platform_shops', function (Blueprint $table) {
            $table->dropColumn('tiktok_seller_account_id');
        });
    }
};
