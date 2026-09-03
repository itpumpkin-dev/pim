<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * (1) attribute `grade` มีตัวเลือกเดียวมาก่อนคือ "standard" ผูกอยู่กับสินค้า 2
 * ตัว (product_id 33, 2634 ตอนเขียน migration นี้) — พอ master ใหม่มีแค่
 * A/B/C/Z ตัวเลือก standard เดิมจะหายไปตอน rebuild ถ้าไม่ย้ายค่าก่อน ตามที่
 * ตกลงกับ user ไว้ (ลบ Standard, สินค้าที่ยังไม่มีเกรดให้เป็นเกรด Z แทน)
 * ย้าย ProductValue.value ของสินค้า 2 ตัวนั้นจาก 'standard' เป็น 'z'
 *
 * (2) import ข้อมูลเกรดจริงของ 51 สินค้า (pID/SKU -&gt; เกรด) ที่ user ให้มา เข้า
 * เป็น ProductValue ของ attribute `grade` — เช็คแล้วก่อนเขียน migration นี้ว่า
 * ทั้ง 51 SKU มีอยู่จริงในตาราง products และไม่มีตัวไหนมีค่า grade ตั้งไว้อยู่ก่อน
 * แล้วเลยสักตัว (0 conflict) ค่าที่เก็บเป็นตัวพิมพ์เล็กเสมอ (normaliseCode()
 * ของ MasterAttributeOptionSync lowercase โค้ดตัวเลือกเสมอ ProductValue.value
 * ต้องตรงกับ AttributeOption.code เป๊ะๆ ถึงจะขึ้นเป็นค่าที่เลือกอยู่ในฟอร์ม)
 *
 * ใช้ updateOrInsert ทั้งสองจุดเพื่อให้ migration รันซ้ำได้อย่างปลอดภัย
 * (idempotent) ถ้าจำเป็นต้อง rerun
 */
return new class extends Migration
{
    /** pID/SKU => เกรด (A/B/C) ตามข้อมูลที่ user แนบมาให้ */
    private const GRADE_BY_SKU = [
        '11108-FB30' => 'C', '11109-FB50' => 'C', '11110-S30C' => 'C', '11111-S50C' => 'B', '17905' => 'A',
        '20535-F' => 'C', '20536-F' => 'C', '20537-F' => 'C', '20538-F' => 'C', '20539-F' => 'C', '20540-F' => 'C',
        '20706-B' => 'C', '20810-F' => 'C', '20811-F' => 'C', '20812-F' => 'C', '20813-F' => 'C', '20814-F' => 'C',
        '28109-F' => 'C', '28110-F' => 'B', '28111-F' => 'B', '28112-F' => 'B', '28113-F' => 'A', '28141-F' => 'B',
        '28142-F' => 'C', '28143-F' => 'B', '28144-F' => 'A', '28145-F' => 'A', '28401-F' => 'A', '28402-F' => 'B',
        '28406-F' => 'B', '28407-F' => 'B', '28633-F' => 'C', '28634-F' => 'C', '28635-F' => 'C', '28636-F' => 'C',
        '28637-F' => 'C', '28638-F' => 'C', '28639-F' => 'C', '28640-F' => 'C', '28641-F' => 'C', '28642-F' => 'C',
        '28643-F' => 'C', '28644-F' => 'C', '28648-F' => 'C', '30201-F' => 'B', '30202-F' => 'A', '30203-F' => 'A',
        '28652-F' => 'C', '42203-2' => 'C', '50214-15' => 'A', '50214-15B2' => 'A',
    ];

    public function up(): void
    {
        $attributeId = DB::table('attributes')->where('code', 'grade')->value('id');
        if (! $attributeId) {
            return;
        }

        // (1) standard -> z
        // (product_values ไม่มีคอลัมน์ created_at/updated_at เลย — ดู
        // Schema::getColumnListing() ตรวจแล้วก่อนแก้จุดนี้)
        DB::table('product_values')
            ->where('attribute_id', $attributeId)
            ->where('value', 'standard')
            ->update(['value' => 'z']);

        // (2) import ข้อมูลเกรดจริงของ 51 สินค้า
        foreach (self::GRADE_BY_SKU as $sku => $grade) {
            $productId = DB::table('products')->where('sku', $sku)->value('id');
            if (! $productId) {
                // ไม่ควรเกิด (เช็คไว้ก่อนเขียน migration นี้แล้วว่าทุก SKU มีอยู่จริง)
                // แต่ข้ามไปเฉยๆ แทนที่จะทำให้ migration ทั้งชุด fail ถ้าข้อมูล
                // สินค้าเปลี่ยนไปก่อนที่ migration นี้จะได้รัน
                continue;
            }

            DB::table('product_values')->updateOrInsert(
                [
                    'product_id' => $productId,
                    'attribute_id' => $attributeId,
                    'channel_id' => null,
                    'locale_id' => null,
                ],
                [
                    'value' => strtolower($grade),
                ],
            );
        }
    }

    public function down(): void
    {
        // ข้อมูล import จริง — ไม่มี rollback ที่สมเหตุสมผล (ย้อน standard<-z
        // ก็ทำได้ไม่ครบเป๊ะถ้ามีคนแก้ไขค่านี้ต่อไปแล้วหลัง migrate)
    }
};
