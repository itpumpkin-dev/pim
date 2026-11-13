<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * ฟิลด์จาก Vendor Master ของ ERP ที่ตาราง vendors ยังไม่มีที่เก็บ — ให้นำเข้าไฟล์ export
     * ของ ERP (VendId … VendShortName, ดู VendorRowImporter) ได้ครบทุกคอลัมน์ ไม่ทิ้งอะไร
     *
     * ที่อยู่ใบกำกับภาษีเก็บแยกช่อง (invoice_*) ไว้ด้วย นอกเหนือจาก tax_invoice_address_1..4
     * เดิมที่ฟอร์มใช้ — importer เติม 4 บรรทัดนั้นให้จากช่องแยกเหล่านี้
     * ไม่เก็บ CreateOn/CreateBy/UpdateOn/UpdateBy ของ ERP — ใช้ created_at/updated_at ของ PIM เอง
     * erp_revision_no = RevisionNo ของ ERP
     */
    public function up(): void
    {
        Schema::table('vendors', function (Blueprint $table) {
            $table->string('vendor_type')->nullable();          // VendType: LocalVend / ImportVend
            $table->string('image')->nullable();                // VendImage
            $table->decimal('latitude', 10, 7)->nullable();     // VendLat
            $table->decimal('longitude', 10, 7)->nullable();    // VendLong
            $table->string('invoice_address_code')->nullable(); // InvAddrId
            $table->string('invoice_name')->nullable();          // InvName
            $table->string('invoice_sub_district')->nullable();
            $table->string('invoice_district')->nullable();
            $table->string('invoice_province')->nullable();
            $table->string('invoice_zipcode')->nullable();
            $table->string('invoice_country')->nullable();
            $table->string('payment_code')->nullable();          // PaymentId
            $table->decimal('credit_limit', 15, 2)->nullable();
            $table->string('line_discount_rate')->nullable();    // VendLineDiscRate — อาจเป็นสูตรอย่าง "5+3"
            $table->string('doc_discount_rate')->nullable();     // VendDocDiscRate
            $table->string('contact_code')->nullable();          // ContactId
            $table->text('ship_remark')->nullable();
            $table->string('business_type_code')->nullable();    // BusinessTypeId
            $table->integer('erp_revision_no')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('vendors', function (Blueprint $table) {
            $table->dropColumn([
                'vendor_type', 'image', 'latitude', 'longitude',
                'invoice_address_code', 'invoice_name', 'invoice_sub_district', 'invoice_district',
                'invoice_province', 'invoice_zipcode', 'invoice_country',
                'payment_code', 'credit_limit', 'line_discount_rate', 'doc_discount_rate',
                'contact_code', 'ship_remark', 'business_type_code',
                'erp_revision_no',
            ]);
        });
    }
};
