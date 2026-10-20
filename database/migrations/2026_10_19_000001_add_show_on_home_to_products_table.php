<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * แยก "แสดงสินค้าที่หน้า Home" (show_on_home — คุมหน้าร้าน / ที่ StorefrontController
 * ใช้) ออกจาก "การเผยแพร่" (enabled — คุมการ push/deactivate ไป Marketplace)
 * เดิม enabled ตัวเดียวคุมทั้งสองอย่าง
 *
 * สินค้าที่มีอยู่แล้วตั้ง show_on_home = enabled ไว้ก่อน หน้า Home จะได้แสดงสินค้า
 * ชุดเดิมทุกอย่างหลัง migrate ส่วน default ของคอลัมน์เป็น false — ทางที่สร้างสินค้า
 * โดยไม่ได้ระบุเอง (Duplicate, Import, variant) จะไม่โผล่หน้า Home จนกว่าจะเปิดเอง
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('show_on_home')->default(false)->after('enabled')->index();
        });

        DB::table('products')->update(['show_on_home' => DB::raw('enabled')]);
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['show_on_home']);
            $table->dropColumn('show_on_home');
        });
    }
};
