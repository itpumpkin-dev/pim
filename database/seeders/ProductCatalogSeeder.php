<?php

namespace Database\Seeders;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use Illuminate\Database\Seeder;

class ProductCatalogSeeder extends Seeder
{
    /**
     * One demo product per glue/chemical-ish product group, real enough to
     * make the storefront (home + product detail) worth looking at.
     * `category` is a free-text fallback stored on the `pcatname` attribute;
     * `category_code` is the real product-group Category (from
     * CategoryTaxonomySeeder) the product is attached to via the
     * `product_category` pivot — ProductPresenter now reads the display
     * category from that real tree (walking up to the root category),
     * falling back to `pcatname` only if no Category is attached.
     */
    private const PRODUCTS = [
        [
            'sku' => 'DEMO-MS-001',
            'name' => 'Fix All High Tack กาวยาแนว MS-Polymer',
            'brand' => 'SOUDAL',
            'category' => 'กาวยาแนว MS-Polymer',
            'category_code' => 'i003001',
            'price' => 175.0,
            'pack_unit' => 'หลอด',
            'pack_qty' => 12,
            'unit_info' => '290 ML/หลอด',
            'description' => 'กาวและยาแนว MS-Polymer แรงยึดเกาะสูง ยืดหยุ่นสูง ทนทุกสภาพอากาศ ใช้ได้กับพื้นผิวหลากหลายทั้งไม้ ปูน เหล็ก และกระจก',
            'features' => "รับแรงยึดติดได้ถึง 320 กก./10 ซม.\nผิวหน้าแห้งใน 5 นาที ไม่ต้องใช้ซัพพอร์ตวัตถุ\nปราศจากสารระเหย ไม่มีกลิ่น กันเชื้อรา กันน้ำ",
            'spec' => 'ความแข็งของเนื้อ 65±5 ชอร์ A, ผิวหน้าแห้งประมาณ 5 นาที, การยืดตัวก่อนขาด 400%',
        ],
        [
            'sku' => 'DEMO-NAIL-001',
            'name' => 'T-Rex Bond กาวตะปู ที-เร็กซ์ (สูตรน้ำ)',
            'brand' => 'SOUDAL',
            'category' => 'กาวตะปู',
            'category_code' => 'i003002',
            'price' => 62.0,
            'pack_unit' => 'หลอด',
            'pack_qty' => 24,
            'unit_info' => '310 ML/หลอด',
            'description' => 'กาวตะปูสูตรน้ำ ใช้แทนน็อตหรือตะปู ปราศจากตัวทำละลาย แรงยึดเหนี่ยวสูง เหมาะกับวัสดุน้ำหนักมาก',
            'features' => "แรงยึดติดเบื้องต้นสูงกว่า 300 กก./ตร.ม.\nไม่มีกลิ่นฉุน เป็นมิตรต่อสิ่งแวดล้อม\nยึดเกาะวัสดุพื้นผิวไม่เรียบได้ดี",
            'spec' => 'เวลาในการติดตั้ง 15 นาที, เวลาในการแข็งตัวประมาณ 20 นาที',
        ],
        [
            'sku' => 'DEMO-SIL-001',
            'name' => 'Soudal Silirub ซิลิโคนอเนกประสงค์',
            'brand' => 'SOUDAL',
            'category' => 'ซิลิโคน',
            'category_code' => 'i003003',
            'price' => 95.0,
            'pack_unit' => 'หลอด',
            'pack_qty' => 20,
            'unit_info' => '280 ML/หลอด',
            'description' => 'ซิลิโคนอเนกประสงค์ ยึดเกาะดี ทนความชื้น เหมาะสำหรับงานยาแนวห้องน้ำและกระจก',
            'features' => "กันน้ำ กันเชื้อรา\nยืดหยุ่นสูง ทนต่อการเคลื่อนตัวของรอยต่อ\nแห้งตัวเร็ว ใช้งานได้ภายใน 30 นาที",
            'spec' => 'ความหนืดปานกลาง, ทนอุณหภูมิ -40°C ถึง 150°C',
        ],
        [
            'sku' => 'DEMO-PU-001',
            'name' => 'Soudaflex 40 FC โพลียูรีเทนยาแนวรอยต่อ',
            'brand' => 'SOUDAL',
            'category' => 'โพลียูรีเทนยาแนว',
            'category_code' => 'i003006',
            'price' => 210.0,
            'pack_unit' => 'หลอด',
            'pack_qty' => 20,
            'unit_info' => '300 ML/หลอด',
            'description' => 'โพลียูรีเทนยาแนวรอยต่อโครงสร้าง ทนแรงสั่นสะเทือน เหมาะกับงานก่อสร้างภายนอกอาคาร',
            'features' => "ทนต่อการเคลื่อนตัวของรอยต่อสูง\nทาสีทับได้หลังแห้งตัว\nทนรังสียูวีและสภาพอากาศ",
            'spec' => 'การยืดตัวก่อนขาด 500%, ทนแรงเคลื่อนตัวของรอยต่อ ±25%',
        ],
        [
            'sku' => 'DEMO-FOAM-001',
            'name' => 'Giant Foam พียูโฟมกระป๋อง',
            'brand' => 'PUMPKIN',
            'category' => 'พียูโฟม',
            'category_code' => 'i003005',
            'price' => 145.0,
            'pack_unit' => 'กระป๋อง',
            'pack_qty' => 12,
            'unit_info' => '750 ML/กระป๋อง',
            'description' => 'พียูโฟมขยายตัว ใช้อุดช่องว่างและยึดกรอบวงกบ ฉนวนกันความร้อนและเสียงได้ดี',
            'features' => "ขยายตัวเต็มที่ภายใน 24 ชม.\nยึดเกาะดีกับผิวคอนกรีต ไม้ และโลหะ\nตัดแต่งได้ง่ายหลังแห้งตัว",
            'spec' => 'อัตราการขยายตัวสูง, แห้งตัวสัมผัสได้ภายใน 10 นาที',
        ],
        [
            'sku' => 'DEMO-CLEAN-001',
            'name' => 'Soudal Cleaner น้ำยาทำความสะอาดคราบกาว',
            'brand' => 'SOUDAL',
            'category' => 'อุปกรณ์ทำความสะอาด',
            'category_code' => 'e021002',
            'price' => 120.0,
            'pack_unit' => 'ขวด',
            'pack_qty' => 24,
            'unit_info' => '500 ML/ขวด',
            'description' => 'น้ำยาทำความสะอาดคราบกาวและซิลิโคนที่ยังไม่แห้งตัว ใช้ล้างมือและเครื่องมือหลังใช้งาน',
            'features' => "ล้างคราบกาว/ซิลิโคนสดได้ทันที\nไม่ทำลายผิวสี/พื้นผิวส่วนใหญ่\nกลิ่นอ่อนโยน ระเหยเร็ว",
            'spec' => 'เหมาะกับคราบกาวที่ยังไม่แห้งตัว, ใช้ร่วมกับผ้าสะอาด',
        ],
        [
            'sku' => 'DEMO-GUN-001',
            'name' => 'ปืนยิงกาวยาแนว รุ่นมาตรฐาน',
            'brand' => 'PUMPKIN',
            'category' => 'ปืนยาแนว/ปืนยิงโฟม',
            'category_code' => 'c024001',
            'price' => 180.0,
            'pack_unit' => 'อัน',
            'pack_qty' => 10,
            'unit_info' => '1 ชิ้น/อัน',
            'description' => 'ปืนยิงกาวยาแนวและโฟมมาตรฐาน ใช้ได้กับหลอดกาว 300 มล. ทั่วไป โครงสร้างแข็งแรงทนทาน',
            'features' => "อัตราทดแรงดัน 18:1 ยิงกาวข้นได้ลื่นมือ\nด้ามจับยางกันลื่น ใช้งานสบายมือ\nรองรับหลอดกาวมาตรฐาน 300 มล.",
            'spec' => 'อัตราทด 18:1, น้ำหนัก 750 กรัม',
        ],
        [
            'sku' => 'DEMO-LOCK-001',
            'name' => 'น้ำยาล็อกเกลียว SUNNIC 262',
            'brand' => 'SUNNIC',
            'category' => 'น้ำยาล็อกเกลียว/ตรึงเพลา',
            'category_code' => 'i002001',
            'price' => 280.0,
            'pack_unit' => 'ขวด',
            'pack_qty' => 16,
            'unit_info' => '15 ML/ขวด',
            'description' => 'น้ำยาล็อกเกลียวเกรด 262 แรงยึดสูง ความหนืดสูง เหมาะสำหรับเกลียวขนาด M20-25 ลงมา ป้องกันการคลายตัวจากแรงสั่นสะเทือน',
            'features' => "เกรด 262 แรงยึดสูง เหมาะกับเกลียว M20-25 ลงมา\nแรงบิดถอด Break 22 N.m. / Prevail 32 N.m.\nทนแรงบิดใช้งาน 14-29 Nm",
            'spec' => 'ความหนืด 1,800 CPS, คุณสมบัติการไหลปานกลาง',
        ],
        [
            'sku' => 'DEMO-HOT-001',
            'name' => 'แท่งกาวร้อน อเนกประสงค์',
            'brand' => 'PUMPKIN',
            'category' => 'กาวร้อน',
            'category_code' => 'i001005',
            'price' => 55.0,
            'pack_unit' => 'แพ็ค',
            'pack_qty' => 50,
            'unit_info' => '1 กก./แพ็ค',
            'description' => 'แท่งกาวร้อนอเนกประสงค์ ใช้กับปืนยิงกาวร้อนทั่วไป ยึดเกาะเร็ว เหมาะกับงานฝีมือและงานซ่อมแซมทั่วไป',
            'features' => "หลอมตัวเร็ว ยึดติดภายในไม่กี่วินาที\nใช้ได้กับไม้ พลาสติก ผ้า และกระดาษ\nไม่มีกลิ่นฉุน",
            'spec' => 'ขนาดแท่ง 11 มม., จุดหลอมเหลวประมาณ 105°C',
        ],
        [
            'sku' => 'DEMO-TAPE-001',
            'name' => 'เทปซ่อมท่อรั่วอเนกประสงค์',
            'brand' => 'PUMPKIN',
            'category' => 'เทปซ่อมแซม',
            'category_code' => 'i004001',
            'price' => 89.0,
            'pack_unit' => 'ม้วน',
            'pack_qty' => 24,
            'unit_info' => '5 ม./ม้วน',
            'description' => 'เทปซ่อมแซมท่อรั่วและรอยแตกอเนกประสงค์ ยืดหยุ่นสูง กันน้ำ ใช้งานง่ายไม่ต้องใช้เครื่องมือ',
            'features' => "ยืดหยุ่นสูง พันได้รอบท่อโค้งงอ\nกันน้ำและทนแรงดันได้ดี\nไม่ต้องใช้กาวหรือความร้อนช่วย",
            'spec' => 'ความกว้าง 5 ซม., ทนแรงดันน้ำได้ถึง 5 บาร์',
        ],
        [
            'sku' => 'DEMO-ACR-001',
            'name' => 'อะคริลิคยาแนวรอยแตกอเนกประสงค์',
            'brand' => 'SOUDAL',
            'category' => 'กาวอะคริลิคยาแนว',
            'category_code' => 'i003007',
            'price' => 75.0,
            'pack_unit' => 'หลอด',
            'pack_qty' => 20,
            'unit_info' => '280 ML/หลอด',
            'description' => 'อะคริลิคยาแนวรอยแตกร้าวผนังและเพดาน ทาสีทับได้ เหมาะกับงานซ่อมแซมภายในอาคาร',
            'features' => "ทาสีทับได้หลังแห้งตัว\nยึดเกาะดีกับปูน ยิปซัม และไม้\nแห้งตัวไม่หดตัวมาก",
            'spec' => 'เวลาแห้งตัวสัมผัส 30 นาที, แห้งตัวสมบูรณ์ 24 ชม.',
        ],
        [
            'sku' => 'DEMO-EPO-001',
            'name' => 'กาวอีพ็อกซี่ 2 ส่วนผสม แรงยึดสูง',
            'brand' => 'PUMPKIN',
            'category' => 'กาวอีพ็อกซี่/เอนกประสงค์',
            'category_code' => 'i001006',
            'price' => 65.0,
            'pack_unit' => 'แท่ง',
            'pack_qty' => 30,
            'unit_info' => '25 ก./แท่ง',
            'description' => 'กาวอีพ็อกซี่ 2 ส่วนผสมในตัวเดียว แรงยึดสูง ใช้ได้กับโลหะ พลาสติก เซรามิค และไม้',
            'features' => "ผสมเสร็จพร้อมใช้ ไม่ต้องตวงสัดส่วน\nแรงยึดสูง ทนแรงกระแทก\nแห้งตัวแข็งภายใน 5-10 นาที",
            'spec' => 'อัตราส่วนผสม 1:1, ทนอุณหภูมิสูงสุด 120°C',
        ],
    ];

    public function run(): void
    {
        $family = AttributeFamily::where('code', 'general_chemical_product')->first();
        $thLocaleId = Locale::where('code', 'th')->value('id');

        $attributeIds = Attribute::whereIn('code', [
            'pname', 'pbrand', 'pcatname', 'price_std', 'pbaseunit',
            'packaging_box', 'unitinfo', 'product_details_features', 'spec_features', 'spec_specifications',
        ])->pluck('id', 'code');

        $localeBased = ['pname', 'product_details_features', 'spec_features', 'spec_specifications'];

        foreach (self::PRODUCTS as $data) {
            $product = Product::updateOrCreate(
                ['sku' => $data['sku']],
                ['family_id' => $family?->id, 'type' => 'simple', 'enabled' => true]
            );

            $values = [
                'pname' => $data['name'],
                'pbrand' => $data['brand'],
                'pcatname' => $data['category'],
                'price_std' => (string) $data['price'],
                'pbaseunit' => $data['pack_unit'],
                'packaging_box' => (string) $data['pack_qty'],
                'unitinfo' => $data['unit_info'],
                'product_details_features' => $data['description'],
                'spec_features' => $data['features'],
                'spec_specifications' => $data['spec'],
            ];

            foreach ($values as $code => $value) {
                $attributeId = $attributeIds->get($code);
                if (!$attributeId) {
                    continue;
                }

                $localeId = in_array($code, $localeBased, true) ? $thLocaleId : null;

                ProductValue::updateOrCreate(
                    ['product_id' => $product->id, 'attribute_id' => $attributeId, 'channel_id' => null, 'locale_id' => $localeId],
                    ['value' => $value]
                );
            }

            $categoryId = Category::where('code', $data['category_code'])->value('id');
            if ($categoryId) {
                $product->categories()->sync([$categoryId]);
            }
        }
    }
}
