<?php

namespace Database\Seeders;

use App\Models\Attribute;
use App\Models\AttributeOption;
use Illuminate\Database\Seeder;

/**
 * Populates dropdown options for select-type attributes that don't have a
 * dedicated master-data source (unlike pcatid/pcatname/psubcatname/
 * productgroupname, seeded from the category CSVs by
 * LegacyCategoryAttributeOptionsSeeder). `code` is an internal ASCII slug
 * (never shown to users); `admin_label` carries the display label shown in
 * the dropdown.
 *
 * attribute code => [option code => admin_label, ...]
 */
class AttributeOptionCatalogSeeder extends Seeder
{
    private const OPTIONS = [
        // หน่วยนับพื้นฐาน (base unit)
        'pbaseunit' => [
            'can' => 'กระป๋อง',
            'box' => 'กล่อง',
            'box_panel' => 'กล่อง(แผง)',
            'kilogram' => 'กิโลกรัม',
            'gross' => 'กุรุส',
            'gallon' => 'แกลลอน',
            'bottle' => 'ขวด',
            'time' => 'ครั้ง',
            'vehicle' => 'คัน',
            'pair' => 'คู่',
            'machine' => 'เครื่อง',
            'shelf' => 'ชั้น',
            'piece' => 'ชิ้น',
            'set' => 'ชุด',
            'sachet' => 'ซอง',
            'duang' => 'ดวง',
            'stud' => 'ดอก',
            'handle' => 'ด้าม',
            'body' => 'ตัว',
            'cabinet' => 'ตู้',
            'tank' => 'ถัง',
            'bag' => 'ถุง',
            'bar' => 'แท่ง',
            'leaf' => 'ใบ',
            'cloth_piece' => 'ผืน',
            'panel' => 'แผง',
            'sheet' => 'แผ่น',
            'pack' => 'แพ็ค',
            'tooth' => 'ฟัน',
            'roll' => 'ม้วน',
            'milliliter' => 'มิลลิลิตร',
            'tablet' => 'เม็ด',
            'meter' => 'เมตร',
            'ream' => 'รีม',
            'crate' => 'ลัง',
            'ball' => 'ลูก',
            'volume' => 'เล่ม',
            'strand' => 'เส้น',
            'tube' => 'หลอด',
            'dozen' => 'โหล',
            'dozen_panel' => 'โหล (แผง)',
            'item' => 'อัน',
        ],

        // แบรนด์
        'pbrand' => [
            'agp' => 'AGP',
            'arca' => 'ARCA',
            'arca_es' => 'ARCA ES',
            'asahi' => 'ASAHI',
            'bigboss' => 'BIGBOSS',
            'customer_brand' => 'Customer Brand',
            'duratek' => 'DURATEK',
            'elite_craft' => 'ELITE CRAFT',
            'fujitsu' => 'FUJITSU',
            'hybrid' => 'HYBRID',
            'hybro' => 'HYBRO',
            'index' => 'INDEX',
            'inomata' => 'INOMATA',
            'ishii' => 'ISHII',
            'je_tech' => 'JE TECH',
            'jit' => 'JIT',
            'kokuyo_nb' => 'KOKUYO NB',
            'magicut' => 'MAGICUT',
            'mancrafts' => 'MANCRAFTS',
            'matsumoto' => 'MATSUMOTO',
            'nagoya' => 'NAGOYA',
            'netto' => 'NETTO',
            'orp' => 'ORP',
            'pangolin' => 'PANGOLIN',
            'pd' => 'PD',
            'pt_t' => 'PT&T',
            'pumpkin' => 'PUMPKIN',
            'pumpkin_home' => 'PUMPKIN HOME',
            'pumpkin_elite_craft' => 'PUMPKIN-ELITE CRAFT',
            'pumpkin_infinity' => 'PUMPKIN-INFINITY',
            'pumpkin_j' => 'PUMPKIN-J',
            'pumpkin_pro' => 'PUMPKIN-PRO',
            'riches' => 'RICHES',
            'soudal' => 'SOUDAL',
            'sp_tools' => 'SP TOOLS',
            'spark' => 'SPARK',
            'st' => 'ST',
            'steeler' => 'STEELER',
            'sunnic' => 'SUNNIC',
            'taiyo' => 'TAIYO',
            'tcc' => 'TCC',
            'texas_bull' => 'TEXAS BULL',
            'texus_bull' => 'TEXUS BULL',
            'tonyon' => 'TONYON',
            'toplon' => 'TOPLON',
            'tsunoda' => 'TSUNODA',
            'winner' => 'WINNER',
            'worx' => 'WORX',
            'yoca' => 'YOCA',
            'brand_premium' => 'พรีเมี่ยมและของแถม',
            'brand_raw_material' => 'วัตถุดิบ',
            'brand_note' => 'หมายเหตุ',
            'brand_spare_part' => 'อะไหล่',
            'brand_other' => 'อื่นๆ',
        ],

        // ประเภทสินค้า
        'producttype' => [
            'customer_brand' => 'Customer Brand',
            'hand_tools' => 'Hand Tools',
            'motor_power_transmission' => 'Motor & Power Tramission',
            'other' => 'Other',
            'power_tools' => 'Power Tools',
            'power_tools_accessories' => 'Power Tools Accessories',
        ],

        // สกุลเงินที่ซื้อ
        'purchase_currency' => [
            'jpy' => 'JPY',
            'rmb' => 'RMB',
            'thb' => 'THB',
            'usd' => 'USD',
        ],
    ];

    public function run(): void
    {
        $attributeIds = Attribute::whereIn('code', array_keys(self::OPTIONS))->pluck('id', 'code');

        foreach (self::OPTIONS as $attributeCode => $options) {
            $attributeId = $attributeIds->get($attributeCode);
            if (!$attributeId) {
                continue;
            }

            $sortOrder = 0;
            foreach ($options as $code => $label) {
                AttributeOption::updateOrCreate(
                    ['attribute_id' => $attributeId, 'code' => $code],
                    ['admin_label' => $label, 'sort_order' => $sortOrder]
                );

                $sortOrder++;
            }
        }
    }
}
