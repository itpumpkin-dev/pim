<?php

namespace Database\Seeders;

use App\Models\Attribute;
use App\Models\AttributeTranslation;
use App\Models\Locale;
use Illuminate\Database\Seeder;

class AttributeTranslationSeeder extends Seeder
{
    /**
     * Human labels for the attribute set declared in AttributeCatalogSeeder,
     * keyed by locale code. Only locales present here are backfilled; any
     * other currently-enabled locale is left for a translator to fill in
     * via the admin UI (Attribute edit > LocaleLabelFields).
     *
     * code => [locale_code => label]
     */
    private const LABELS = [
        'pbaseunit' => ['en' => 'Base Unit', 'th' => 'หน่วยนับพื้นฐาน', 'zh' => '基本单位'],
        'pbrand' => ['en' => 'Brand', 'th' => 'แบรนด์', 'zh' => '品牌'],
        'pcatid' => ['en' => 'Category ID', 'th' => 'รหัสหมวดหมู่', 'zh' => '类别编号'],
        'pcatname' => ['en' => 'Category Name', 'th' => 'ชื่อหมวดหมู่', 'zh' => '类别名称'],
        'psubcatname' => ['en' => 'Subcategory Name', 'th' => 'ชื่อหมวดหมู่ย่อย', 'zh' => '子类别名称'],
        'productgroupname' => ['en' => 'Product Group Name', 'th' => 'ชื่อกลุ่มสินค้า', 'zh' => '产品组名称'],
        'producttype' => ['en' => 'Product Type', 'th' => 'ประเภทสินค้า', 'zh' => '产品类型'],
        'eol' => ['en' => 'End of Life', 'th' => 'สิ้นสุดการผลิต (EOL)', 'zh' => '停产（EOL）'],
        'pgroupname' => ['en' => 'Group Name', 'th' => 'ชื่อกลุ่ม', 'zh' => '组名称'],
        'pimage' => ['en' => 'Product Image', 'th' => 'รูปภาพสินค้า', 'zh' => '产品图片'],
        'unitinfo' => ['en' => 'Unit Info', 'th' => 'ข้อมูลหน่วยนับ', 'zh' => '单位信息'],
        'pointtype' => ['en' => 'Point Type', 'th' => 'ประเภทคะแนน', 'zh' => '积分类型'],
        'barcode_pcs' => ['en' => 'Barcode (Piece)', 'th' => 'บาร์โค้ด (ชิ้น)', 'zh' => '条形码（件）'],
        'width_pcs' => ['en' => 'Width (Piece)', 'th' => 'ความกว้าง (ชิ้น)', 'zh' => '宽度（件）'],
        'length_pcs' => ['en' => 'Length (Piece)', 'th' => 'ความยาว (ชิ้น)', 'zh' => '长度（件）'],
        'height_pcs' => ['en' => 'Height (Piece)', 'th' => 'ความสูง (ชิ้น)', 'zh' => '高度（件）'],
        'packaging_pcs' => ['en' => 'Packaging (Piece)', 'th' => 'บรรจุภัณฑ์ (ชิ้น)', 'zh' => '包装（件）'],
        'weight_pcs' => ['en' => 'Weight (Piece)', 'th' => 'น้ำหนัก (ชิ้น)', 'zh' => '重量（件）'],
        'barcode_box' => ['en' => 'Barcode (Box)', 'th' => 'บาร์โค้ด (กล่อง)', 'zh' => '条形码（盒）'],
        'width_box' => ['en' => 'Width (Box)', 'th' => 'ความกว้าง (กล่อง)', 'zh' => '宽度（盒）'],
        'length_box' => ['en' => 'Length (Box)', 'th' => 'ความยาว (กล่อง)', 'zh' => '长度（盒）'],
        'height_box' => ['en' => 'Height (Box)', 'th' => 'ความสูง (กล่อง)', 'zh' => '高度（盒）'],
        'packaging_box' => ['en' => 'Packaging (Box)', 'th' => 'บรรจุภัณฑ์ (กล่อง)', 'zh' => '包装（盒）'],
        'weight_box' => ['en' => 'Weight (Box)', 'th' => 'น้ำหนัก (กล่อง)', 'zh' => '重量（盒）'],
        'barcode_ctn' => ['en' => 'Barcode (Carton)', 'th' => 'บาร์โค้ด (คาร์ตัน)', 'zh' => '条形码（箱）'],
        'width_ctn' => ['en' => 'Width (Carton)', 'th' => 'ความกว้าง (คาร์ตัน)', 'zh' => '宽度（箱）'],
        'length_ctn' => ['en' => 'Length (Carton)', 'th' => 'ความยาว (คาร์ตัน)', 'zh' => '长度（箱）'],
        'height_ctn' => ['en' => 'Height (Carton)', 'th' => 'ความสูง (คาร์ตัน)', 'zh' => '高度（箱）'],
        'packaging_ctn' => ['en' => 'Packaging (Carton)', 'th' => 'บรรจุภัณฑ์ (คาร์ตัน)', 'zh' => '包装（箱）'],
        'weight_ctn' => ['en' => 'Weight (Carton)', 'th' => 'น้ำหนัก (คาร์ตัน)', 'zh' => '重量（箱）'],
        'warranty_period' => ['en' => 'Warranty Period', 'th' => 'ระยะเวลารับประกัน', 'zh' => '保修期'],
        'warranty_conditions' => ['en' => 'Warranty Conditions', 'th' => 'เงื่อนไขการรับประกัน', 'zh' => '保修条款'],
        'warranty_notes' => ['en' => 'Warranty Notes', 'th' => 'หมายเหตุการรับประกัน', 'zh' => '保修备注'],
        'price_std' => ['en' => 'Standard Price', 'th' => 'ราคามาตรฐาน', 'zh' => '标准价格'],
        'price_recommend' => ['en' => 'Recommended Price', 'th' => 'ราคาแนะนำ', 'zh' => '建议零售价'],
        'search' => ['en' => 'Search Keywords', 'th' => 'คำค้นหา', 'zh' => '搜索关键词'],
        'product_details_features' => ['en' => 'Product Details & Features', 'th' => 'รายละเอียดและคุณสมบัติสินค้า', 'zh' => '产品详情与特点'],
        'accessories_freebies' => ['en' => 'Accessories & Freebies', 'th' => 'อุปกรณ์เสริมและของแถม', 'zh' => '配件与赠品'],
        'included_accessories' => ['en' => 'Included Accessories', 'th' => 'อุปกรณ์ที่ให้มาในกล่อง', 'zh' => '随附配件'],
        'optional_accessories' => ['en' => 'Optional Accessories', 'th' => 'อุปกรณ์เสริม (ซื้อเพิ่ม)', 'zh' => '选购配件'],
        'how_to_use' => ['en' => 'How to Use', 'th' => 'วิธีใช้งาน', 'zh' => '使用方法'],
        'warnings' => ['en' => 'Warnings', 'th' => 'คำเตือน', 'zh' => '警告'],
        'precautions' => ['en' => 'Precautions', 'th' => 'ข้อควรระวัง', 'zh' => '注意事项'],
        'storage_instructions' => ['en' => 'Storage Instructions', 'th' => 'วิธีการจัดเก็บ', 'zh' => '存储说明'],
        'recommendations' => ['en' => 'Recommendations', 'th' => 'คำแนะนำ', 'zh' => '推荐建议'],
        'notes' => ['en' => 'Notes', 'th' => 'หมายเหตุ', 'zh' => '备注'],
        'spec_specifications' => ['en' => 'Specifications', 'th' => 'ข้อมูลจำเพาะ', 'zh' => '规格参数'],
        'spec_features' => ['en' => 'Features', 'th' => 'คุณสมบัติเด่น', 'zh' => '功能特点'],
        'spec_accessories' => ['en' => 'Specification Accessories', 'th' => 'อุปกรณ์ตามสเปค', 'zh' => '规格配件'],
        'spec_packaging' => ['en' => 'Specification Packaging', 'th' => 'บรรจุภัณฑ์ตามสเปค', 'zh' => '规格包装'],
        'shelflife' => ['en' => 'Shelf Life', 'th' => 'อายุการเก็บรักษา', 'zh' => '保质期'],
        'grade' => ['en' => 'Grade', 'th' => 'เกรดสินค้า', 'zh' => '等级'],
        'cover_month' => ['en' => 'Coverage (Months)', 'th' => 'ระยะเวลาคุ้มครอง (เดือน)', 'zh' => '覆盖期（月）'],
        'leadtime' => ['en' => 'Lead Time', 'th' => 'ระยะเวลาจัดส่ง', 'zh' => '交货时间'],
        'first_import_date' => ['en' => 'First Import Date', 'th' => 'วันที่นำเข้าครั้งแรก', 'zh' => '首次进口日期'],
        'sales_channel' => ['en' => 'Sales Channel', 'th' => 'ช่องทางการขาย', 'zh' => '销售渠道'],
        'moq' => ['en' => 'Minimum Order Quantity', 'th' => 'จำนวนสั่งซื้อขั้นต่ำ (MOQ)', 'zh' => '最小起订量（MOQ）'],
        'bom' => ['en' => 'Bill of Materials', 'th' => 'รายการวัสดุ (BOM)', 'zh' => '物料清单（BOM）'],
        'min_stock' => ['en' => 'Minimum Stock', 'th' => 'สต็อกขั้นต่ำ', 'zh' => '最低库存'],
        'max_stock' => ['en' => 'Maximum Stock', 'th' => 'สต็อกสูงสุด', 'zh' => '最高库存'],
        'qty' => ['en' => 'Quantity', 'th' => 'จำนวน', 'zh' => '数量'],

        'sale_pack_size' => ['en' => 'Sale Pack Size', 'th' => 'จำนวนต่อแพ็คขาย', 'zh' => '销售包装数量'],
        'is_main_sale_unit' => ['en' => 'Main Sale Unit', 'th' => 'เป็นหน่วยขายหลัก', 'zh' => '主要销售单位'],
        'is_main_purchase_unit' => ['en' => 'Main Purchase Unit', 'th' => 'เป็นหน่วยซื้อหลัก', 'zh' => '主要采购单位'],
        'commission_group' => ['en' => 'Commission Group', 'th' => 'กลุ่มคอมมิชชั่น', 'zh' => '佣金组'],
        'end_bill_discount' => ['en' => 'End of Bill Discount', 'th' => 'ส่วนลดท้ายบิล', 'zh' => '账单尾款折扣'],
        'price_type' => ['en' => 'Price Type', 'th' => 'ประเภทราคา', 'zh' => '价格类型'],
        'size' => ['en' => 'Size', 'th' => 'ขนาด', 'zh' => '尺寸'],
        'model' => ['en' => 'Model', 'th' => 'รุ่น', 'zh' => '型号'],
        'vendor' => ['en' => 'Vendor', 'th' => 'เวนเดอร์', 'zh' => '供应商'],
        'sub_vendor' => ['en' => 'Sub Vendor', 'th' => 'ซับเวนเดอร์', 'zh' => '次级供应商'],
        'purchase_currency' => ['en' => 'Purchase Currency', 'th' => 'สกุลเงินที่ซื้อ', 'zh' => '采购货币'],
        'hs_code' => ['en' => 'HS Code', 'th' => 'พิกัดศุลกากร (HS Code)', 'zh' => '海关编码（HS Code）'],
        'import_duty' => ['en' => 'Import Duty', 'th' => 'ภาษีอากรขาเข้า (Duty)', 'zh' => '进口关税'],
        'ordinary_certificate_of_origin' => ['en' => 'Ordinary Certificate of Origin', 'th' => 'หนังสือรับรองสำหรับลดหย่อนภาษี', 'zh' => '普通原产地证书'],
        'final_duty' => ['en' => 'Final Duty', 'th' => 'ภาษีอากรขาเข้าหลังลดหย่อนภาษี (Final Duty)', 'zh' => '最终进口关税'],
        'statistics_code' => ['en' => 'Statistics Code', 'th' => 'รหัสสถิติ', 'zh' => '统计代码'],
        'pcs_per_ctn' => ['en' => 'Pieces per Carton', 'th' => 'จำนวนต่อลัง (PcsPerCTN)', 'zh' => '每箱件数'],
        'replace_old_product' => ['en' => 'Replaces Old Product', 'th' => 'ทดแทนสินค้าเก่า', 'zh' => '替代旧产品'],
        'replace_out_of_stock' => ['en' => 'Replacement When Out of Stock', 'th' => 'ทดแทนกรณีสต็อกหมด', 'zh' => '缺货替代品'],
        'is_bom' => ['en' => 'Is BOM', 'th' => 'เป็น BOM', 'zh' => '是否为物料清单'],
        'bom_data' => ['en' => 'BOM Data', 'th' => 'ข้อมูล BOM', 'zh' => '物料清单数据'],
        'rmp_id' => ['en' => 'RMP ID', 'th' => 'รหัส RMP', 'zh' => 'RMP 编号'],
        'rop' => ['en' => 'Reorder Point (ROP)', 'th' => 'จุดสั่งซื้อซ้ำ (ROP)', 'zh' => '再订购点（ROP）'],
        'discount_std' => ['en' => 'Standard Discount', 'th' => 'ส่วนลด (มาตรฐาน)', 'zh' => '标准折扣'],
        'cost_std' => ['en' => 'Standard Cost', 'th' => 'ต้นทุน (มาตรฐาน)', 'zh' => '标准成本'],
        'gp_std' => ['en' => 'Standard GP', 'th' => 'GP (มาตรฐาน)', 'zh' => '标准毛利'],
    ];

    /**
     * Backfills attribute_translations for every currently-enabled locale,
     * for whichever attributes are missing a row. Existing rows are left
     * untouched so admin-edited labels are never overwritten.
     */
    public function run(): void
    {
        $locales = Locale::where('enabled', true)->get(['id', 'code']);

        $attributes = Attribute::whereIn('code', array_keys(self::LABELS))->get(['id', 'code', 'name']);

        foreach ($attributes as $attribute) {
            $labels = self::LABELS[$attribute->code] ?? [];
            $existingLocaleIds = AttributeTranslation::where('attribute_id', $attribute->id)
                ->pluck('locale_id')
                ->all();

            foreach ($locales as $locale) {
                if (in_array($locale->id, $existingLocaleIds, true)) {
                    continue;
                }

                $label = $labels[$locale->code] ?? $attribute->name;

                AttributeTranslation::create([
                    'attribute_id' => $attribute->id,
                    'locale_id' => $locale->id,
                    'label' => $label,
                ]);
            }
        }
    }
}
