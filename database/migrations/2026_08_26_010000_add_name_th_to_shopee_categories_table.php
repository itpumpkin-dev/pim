<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * ShopeeClient::getCategoryTree() ยิง v2.product.get_category ด้วย
     * `language` param ได้อยู่แล้ว แต่ syncShopeeCategories() เดิมเรียกแบบไม่ระบุ
     * (ค่า default ของ ShopeeClient เป็น 'en') ชื่อที่ sync เข้ามาจึงเป็นอังกฤษ
     * ล้วน — คอลัมน์นี้เก็บชื่อไทยควบคู่ไปกับ `name` (อังกฤษ) แทนการแทนที่ เพราะ
     * ทั้งสองภาษายังมีประโยชน์คนละจุด (ค้นหา/จับคู่ด้วยชื่ออังกฤษที่ตรงกับที่
     * Shopee เอกสารไว้ vs. โชว์ให้ผู้ใช้ไทยอ่านเข้าใจ) ไม่ใช่ตาราง translations
     * แบบ CategoryTranslation ของ PIM เอง เพราะ shopee_categories เป็นแค่แคช
     * sync มา ไม่ใช่ content ที่แอดมินแก้ไขเองทีละภาษา — สองคอลัมน์ก็พอ ไม่ต้อง
     * มีมิติ locale เต็มรูปแบบ
     */
    public function up(): void
    {
        Schema::table('shopee_categories', function (Blueprint $table) {
            $table->string('name_th')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('shopee_categories', function (Blueprint $table) {
            $table->dropColumn('name_th');
        });
    }
};
