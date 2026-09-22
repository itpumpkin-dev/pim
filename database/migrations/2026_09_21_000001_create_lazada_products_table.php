<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Master Product List" ที่การ์ดใหม่ใน /catalog/marketplace/lazada เปิดไปหา —
 * cache ของสิ่งที่ "จริงๆ อยู่บน Lazada" ต่อร้าน (SalesPlatformShop) ไม่ผูกกับ
 * PIM Product เลย (ต่างจาก product_platform_shops ซึ่งเป็น pivot ที่ต้อง
 * match กับ products.sku ได้ก่อนถึงจะมีแถว — listing บน Lazada ที่ SellerSku
 * ไม่ตรงกับ PIM SKU ไหนเลยก็ยังต้องเห็นในลิสต์นี้ได้ นี่คือเหตุผลที่ต้องมีตาราง
 * ใหม่แยกต่างหาก ไม่ reuse ของเดิม)
 *
 * คีย์ด้วย (sales_platform_shop_id, seller_sku) ไม่ใช่ item_id เดี่ยวๆ —
 * item_id เป็นเลขที่ Lazada ออกให้ต่อร้าน ไม่ยืนยันว่าไม่ชนกันข้ามร้าน (ต่างจาก
 * lazada_categories/lazada_brands ที่เป็น catalog กลางจริงๆ ของ Lazada เอง
 * id เดียวใช้ได้ทุกร้าน) — seller_sku คือ SKU ของเราเองที่ไม่ซ้ำอยู่แล้วภายใน
 * ร้านเดียว ปลอดภัยกว่าในการใช้เป็นคีย์
 *
 * LazadaProductSyncService::syncMasterProductList() เป็นคนเขียนตารางนี้ —
 * ดู docblock ของมันสำหรับ pagination/upsert convention ที่ mirror จาก
 * CategoryController::syncLazadaCategories()
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lazada_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_platform_shop_id')->constrained('sales_platform_shops')->cascadeOnDelete();
            $table->unsignedBigInteger('item_id');
            $table->unsignedBigInteger('sku_id')->nullable();
            $table->string('seller_sku');
            $table->string('shop_sku')->nullable();
            $table->string('name')->nullable();
            $table->string('status')->nullable();
            $table->integer('quantity')->nullable();
            $table->decimal('price', 14, 2)->nullable();
            $table->string('image_url')->nullable();
            $table->string('lazada_url')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['sales_platform_shop_id', 'seller_sku']);
            $table->index('item_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lazada_products');
    }
};
