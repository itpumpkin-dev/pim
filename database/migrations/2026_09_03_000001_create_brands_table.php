<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "แบรนด์" (Brands) เดิมเป็นหน้าจอ CRUD ตรงบนแถว AttributeOption ของ attribute
 * ชื่อ `pbrand` (ดู BrandController เวอร์ชันเก่า) — ย้ายมาเป็น master table ของ
 * ตัวเอง แบบเดียวกับ base_units/product_types/business_types ผูก master_source
 * = 'brands' เข้ากับ attribute `pbrand` (ดู MasterAttributeOptionSync) เพื่อให้
 * เลือกเป็นแหล่งข้อมูล Master ของ attribute อื่นได้ด้วย
 *
 * ต่างจาก base_units ตรงที่ pbrand มีข้อมูลเฉพาะทางติดมาด้วยเยอะกว่ามาก
 * (thumbnail, ลำดับชั้นแบรนด์แม่-ลูก, และรหัสแบรนด์ของ Shopee/Lazada/TikTok/
 * WooCommerce ที่จับคู่ไว้ — ใช้จริงโดย
 * ResolvesProductAttributeValues::mappedBrandOptionId() ตอน push สินค้าไป
 * marketplace) — ย้ายมาทั้งหมดที่นี่ ไม่ใช่แค่ code/name/description เฉยๆ
 * เพราะข้อมูลพวกนี้ไม่ใช่ "แค่ตัวเลือกของ select field" อีกต่อไป แต่เป็นข้อมูล
 * ที่ระบบอื่น (marketplace sync) ต้องอ่านตรงๆ คอลัมน์ marketplace brand id
 * เป็น unsignedBigInteger เดิม (ไม่มี FK constraint จริง — ข้อมูลอ้างอิงแบบ
 * "informational" เหมือนกับที่ AttributeOption เดิมทำ) คง type เดิมไว้เป๊ะ
 * (TikTok brand id ยาวถึง 19 หลัก ต้องเป็น bigint ไม่ใช่ int ธรรมดา)
 *
 * โยกข้อมูลจาก AttributeOption/AttributeOptionTranslation เดิมของ pbrand มา
 * ทั้งหมด คงรหัส `code` เดิมทุกตัวไว้ (ProductValue.value ของสินค้าที่มีอยู่แล้ว
 * อ้างอิง code นี้ตรงๆ ไม่ใช่ id ของ option) parent_id ย้ายแบบสองรอบ (insert
 * ก่อน แล้วค่อย map parent ทีหลัง) เพราะ id ใหม่ของแต่ละแถวยังไม่รู้จนกว่าจะ
 * insert ครบทุกแถวก่อน — ตรวจสอบแล้วก่อนเขียน migration นี้ว่าข้อมูลจริงตอนนี้
 * ยังไม่มีแบรนด์ไหนตั้ง parent_id ไว้เลยสักตัว (0 จาก 54 แบรนด์) แต่เขียนให้
 * ถูกต้องไว้ก่อนเผื่ออนาคต
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->text('description')->nullable();
            $table->string('thumbnail')->nullable();
            $table->foreignId('parent_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->unsignedBigInteger('shopee_brand_id')->nullable();
            $table->unsignedBigInteger('lazada_brand_id')->nullable();
            $table->unsignedBigInteger('tiktok_brand_id')->nullable();
            $table->unsignedBigInteger('woocommerce_brand_id')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('brand_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['brand_id', 'locale_id'], 'uq_brand_translations_brand_locale');
        });

        $attributeId = DB::table('attributes')->where('code', 'pbrand')->value('id');
        if (! $attributeId) {
            return;
        }

        // 'th' ตรงๆ แทนที่จะพึ่ง config('app.locale') — ค่านั้นมาจาก APP_LOCALE
        // ใน .env ซึ่งอาจไม่ตรงกับภาษาที่ admin_label ดิบจริงๆ ถูกกรอกไว้ (เจอ
        // ปัญหานี้มาแล้วรอบนึงตอนย้าย base_units — ดู
        // 2026_09_02_000007_create_base_units_table.php)
        $defaultLocaleId = DB::table('locales')->where('code', 'th')->value('id')
            ?? DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');
        $now = now();

        $options = DB::table('attribute_options')->where('attribute_id', $attributeId)->orderBy('sort_order')->get();

        // รอบแรก: insert ทุกแบรนด์โดยยังไม่ผูก parent_id (ไม่รู้ id ใหม่ของ parent
        // จนกว่าจะ insert ครบทุกแถวก่อน)
        $newIdByOldOptionId = [];
        foreach ($options as $option) {
            $newId = DB::table('brands')->insertGetId([
                'code' => $option->code,
                'name' => $option->admin_label !== null && trim((string) $option->admin_label) !== '' ? $option->admin_label : $option->code,
                'slug' => $option->slug,
                'description' => $option->description,
                'thumbnail' => $option->thumbnail,
                'shopee_brand_id' => $option->shopee_brand_id,
                'lazada_brand_id' => $option->lazada_brand_id,
                'tiktok_brand_id' => $option->tiktok_brand_id,
                'woocommerce_brand_id' => $option->woocommerce_brand_id,
                'sort_order' => $option->sort_order ?? 0,
                'is_active' => (bool) $option->is_active,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $newIdByOldOptionId[$option->id] = $newId;

            if ($defaultLocaleId && trim((string) $option->admin_label) !== '') {
                DB::table('brand_translations')->insert([
                    'brand_id' => $newId,
                    'locale_id' => $defaultLocaleId,
                    'label' => $option->admin_label,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        // รอบสอง: ผูก parent_id ตาม mapping ที่เพิ่งสร้างไว้ข้างบน
        foreach ($options as $option) {
            if ($option->parent_id !== null && isset($newIdByOldOptionId[$option->parent_id])) {
                DB::table('brands')
                    ->where('id', $newIdByOldOptionId[$option->id])
                    ->update(['parent_id' => $newIdByOldOptionId[$option->parent_id]]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('brand_translations');
        Schema::dropIfExists('brands');
    }
};
