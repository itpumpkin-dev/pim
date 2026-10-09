<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * สถานะสินค้า (Product Status): active / hold / delete / new — แยกจาก
 * `enabled` เดิมโดยสิ้นเชิง (enabled ยังคุมหน้าร้าน/API/push-deactivate
 * Marketplace เหมือนเดิมทุกอย่าง) ตัวนี้เป็นแค่ป้ายสถานะไว้ติด/กรองใน PIM
 * เท่านั้น — สินค้าสถานะ delete จะถูกซ่อนจากหน้ารายการสินค้าโดยตั้งต้น (ดู
 * ProductController::index()) จนกว่าจะกรองดูสถานะนั้นเอง
 *
 * default ของคอลัมน์เป็น 'new' เพื่อให้ทุกทางที่สร้างสินค้า (Create,
 * Duplicate, Import, variant) ได้ New อัตโนมัติ ส่วนสินค้าที่มีอยู่แล้ว
 * ทั้งหมดถูกตั้งเป็น 'active' ตามที่ user ขอ
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('status', 20)->default('new')->after('enabled')->index();
        });

        DB::table('products')->update(['status' => 'active']);
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropColumn('status');
        });
    }
};
