<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * สถานะดิบจาก platform (Lazada "inactive", Shopee "UNLIST", TikTok
     * "SELLER_DEACTIVATED", Woo "draft" ...) ที่ได้จาก "เช็คสถานะบนร้าน"
     * ({Platform}ProductSyncService::checkLiveStatus()) — `status` เก็บแค่
     * live/null เลยบอกไม่ได้ว่าไม่ Live เพราะอะไร หน้า Push แสดงค่านี้แทน
     * "ยังไม่ Live" เมื่อมี
     */
    public function up(): void
    {
        Schema::table('product_platform_shops', function (Blueprint $table) {
            $table->string('platform_status')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('product_platform_shops', function (Blueprint $table) {
            $table->dropColumn('platform_status');
        });
    }
};
