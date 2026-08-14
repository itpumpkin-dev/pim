<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_platform_shops', function (Blueprint $table) {
            // References n8n's shopee_tokens.shop_id on a separate Postgres
            // instance — same cross-database situation as
            // lazada_seller_account_id above, resolved in application code
            // instead of a real FK. String, not unsignedBigInteger, because
            // Shopee's shop_id (the table's own primary key) is a
            // Shopee-assigned string, unlike Lazada's integer id.
            $table->string('shopee_seller_account_id')->nullable()->after('lazada_seller_account_id');
        });
    }

    public function down(): void
    {
        Schema::table('sales_platform_shops', function (Blueprint $table) {
            $table->dropColumn('shopee_seller_account_id');
        });
    }
};
