<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * แปลงข้อมูล Product/ProductValue แบบ EAV ให้อยู่ในรูปแบบธรรมดาที่หน้าแรกฝั่ง
 * สาธารณะและหน้า preview products/show ฝั่งสตาฟฟ์ต้องการใช้ ให้ตรงกับ
 * interface `Product` ใน resources/js/data/products.ts
 */
class ProductPresenter
{
    private const CODES = [
        'pname', 'pbrand', 'pcatname', 'pimage',
        'price_std', 'price_recommend',
        'pbaseunit', 'packaging_box', 'unitinfo', 'eol',
        'product_details_features', 'spec_specifications', 'spec_features',
        'spec_accessories', 'spec_packaging', 'warranty_period',
        'how_to_use', 'warnings',
    ];

    /** code แบบ select ใน CODES ที่ค่าที่เก็บไว้เป็น code ของ AttributeOption ไม่ใช่ label ที่ใช้แสดงผล — ดู resolveSelectOptionLabels() */
    private const SELECT_CODES_TO_RESOLVE = ['pcatname', 'pbaseunit', 'pbrand'];

    /**
     * @param  string  $localeCode  จะเอาแถว ProductValue (pname, spec_*, ...) ของ locale
     *                              ไหนมาแสดง ค่า default คือ 'th' แต่ผู้เรียกทุกตัวใน
     *                              ปัจจุบัน (home()/show() ของ StorefrontController,
     *                              ผู้เรียกฝั่งแอดมินอย่างหน้า dashboard) จะส่ง
     *                              app()->getLocale() มาแทนอย่างชัดเจนทุกครั้ง ผลลัพธ์
     *                              เลยจะตาม locale ที่ผู้เข้าชม/แอดมินสลับไว้เสมอ
     * @param  ?User  $viewer  ถ้าส่งมา ฟิลด์ที่ attribute อยู่ใน Attribute Group ที่
     *                         role ของผู้ดูนั้นดูไม่ได้ (สิทธิ์ Attribute Access) จะถูก
     *                         เคลียร์ค่าออกเป็นว่าง — กฎเดียวกับหน้าแก้ไขสินค้าและ
     *                         export/import ถ้าเป็น null (ค่า default ที่หน้า home()
     *                         ฝั่งสาธารณะใช้) แปลว่าไม่มีการจำกัดใดๆ
     */
    public static function mapMany(Collection $products, string $localeCode = 'th', ?User $viewer = null): array
    {
        if ($products->isEmpty()) {
            return [];
        }

        $attributesByCode = Attribute::whereIn('code', self::CODES)->get(['id', 'code', 'name'])->keyBy('id');
        $allowedCodes = app(AttributeAccessPolicy::class)->filterAttributeCodes($viewer, self::CODES, 'view');

        // Attribute::name จะ resolve ผ่านความสัมพันธ์ translations ไปเป็น label
        // ที่แอดมินตั้งค่าไว้จริงๆ (ในหน้าจัดการ Attribute) ตาม locale ปัจจุบันของแอป —
        // ใช้เพื่อให้ตาราง specs โชว์หัวข้อที่แอดมินแก้ไขได้จริง แทนที่จะเป็น
        // ข้อความที่ hardcode ไว้ในคลาสนี้
        $labelsByCode = $attributesByCode->values()->pluck('name', 'code');

        // Attribute ที่แยกตาม locale (pname, spec_*, ...) จะเก็บ ProductValue หนึ่งแถว
        // ต่อ locale โชว์แค่ $localeCode เท่านั้น และเรียงให้แถวแบบ null-locale
        // (global) มาก่อนแถวที่ระบุ locale ชัดเจน เพื่อให้แถวเฉพาะ locale ชนะเสมอ
        // เวลามีทั้งสองแบบสำหรับ attribute เดียวกัน — ไม่งั้นจะกลายเป็นว่า DB
        // คืนแถวไหนมาทีหลังก็ชนะแบบสุ่มๆ
        $defaultLocaleId = Locale::where('code', $localeCode)->value('id');

        $values = ProductValue::whereIn('product_id', $products->pluck('id'))
            ->whereIn('attribute_id', $attributesByCode->keys())
            ->whereNull('channel_id')
            ->where(function ($query) use ($defaultLocaleId) {
                $query->whereNull('locale_id');
                if ($defaultLocaleId) {
                    $query->orWhere('locale_id', $defaultLocaleId);
                }
            })
            ->orderByRaw('CASE WHEN locale_id IS NULL THEN 0 ELSE 1 END ASC')
            ->get(['product_id', 'attribute_id', 'locale_id', 'value']);

        $valuesByProduct = $values->groupBy('product_id')->map(
            fn (Collection $rows) => $rows->mapWithKeys(
                fn (ProductValue $row) => [$attributesByCode[$row->attribute_id]->code => $row->value]
            )
        );

        $valuesByProduct = self::resolveSelectOptionLabels($valuesByProduct, $attributesByCode);

        $categoryNamesByProduct = self::rootCategoryNames($products);

        return $products->map(
            fn (Product $product) => self::mapOne(
                $product,
                $valuesByProduct->get($product->id, collect()),
                $categoryNamesByProduct->get($product->id),
                $allowedCodes,
                $labelsByCode
            )
        )->values()->all();
    }

    /**
     * pcatname/pbaseunit/pbrand เป็นฟิลด์แบบ select ที่อิงกับ AttributeOption
     * ซึ่งค่าที่เก็บไว้จะเป็น `code` ของตัวเลือก (ไม่ใช่ label — code ต้อง unique
     * ต่อ attribute หนึ่งตัว แต่ label หลายอันมันซ้ำกันข้าม attribute ได้ เลยเอา
     * label มาใช้แทน code ไม่ได้) เมธอดนี้จะ resolve กลับไปเป็น admin_label
     * ตัวจริง เพื่อให้ทุกที่ที่ใช้ผลลัพธ์จาก mapping นี้เห็น "พัมคิน"/"ชิ้น" แทนที่จะ
     * เห็น code เปล่าๆ อย่าง "option_1" ค่าที่มีมาก่อนฟิลด์จะกลายเป็น dropdown
     * (พิมพ์เป็นข้อความอิสระ) จะไม่ตรงกับ option code ไหนเลย ก็จะปล่อยผ่านไป
     * โดยไม่แก้ไข
     *
     * @return Collection<int, Collection<string, string>>
     */
    private static function resolveSelectOptionLabels(Collection $valuesByProduct, Collection $attributesByCode): Collection
    {
        $attributeIdsByCode = collect(self::SELECT_CODES_TO_RESOLVE)
            ->mapWithKeys(fn (string $code) => [$code => $attributesByCode->search(fn ($attr) => $attr->code === $code)])
            ->filter(fn ($id) => $id !== false);

        if ($attributeIdsByCode->isEmpty()) {
            return $valuesByProduct;
        }

        $labelsByAttributeId = AttributeOption::whereIn('attribute_id', $attributeIdsByCode->values())
            ->get(['attribute_id', 'code', 'admin_label'])
            ->groupBy('attribute_id')
            ->map(fn (Collection $options) => $options->pluck('admin_label', 'code'));

        return $valuesByProduct->map(function (Collection $values) use ($attributeIdsByCode, $labelsByAttributeId) {
            foreach ($attributeIdsByCode as $code => $attributeId) {
                if ($values->has($code)) {
                    $raw = $values->get($code);
                    $labels = $labelsByAttributeId->get($attributeId, collect());
                    $values = $values->put($code, $labels->get($raw, $raw));
                }
            }

            return $values;
        });
    }

    /**
     * การ assign หมวดหมู่จริง (product_category pivot) จะมาก่อน attribute
     * แบบ free-text แบบเก่าอย่าง `pcatname` เสมอ สินค้าส่วนใหญ่มักถูก tag ไว้ที่
     * level เจาะจงที่สุด (product-group) เมธอดนี้เลยไล่แต่ละหมวดหมู่ขึ้นไปหา
     * บรรพบุรุษระดับบนสุด — เพราะตัวกรองหมวดหมู่บนหน้า storefront จะโชว์แค่
     * ~19 หมวดหมู่ root เท่านั้น ไม่ใช่ product group เป็นร้อยๆ ตัว
     *
     * @return Collection<int, string> คีย์ด้วย product id
     */
    private static function rootCategoryNames(Collection $products): Collection
    {
        $assignedCategoryId = DB::table('product_category')
            ->whereIn('product_id', $products->pluck('id'))
            ->get(['product_id', 'category_id'])
            ->groupBy('product_id')
            ->map(fn (Collection $rows) => $rows->first()->category_id);

        if ($assignedCategoryId->isEmpty()) {
            return collect();
        }

        // ต้นไม้นี้ลึกแค่ 3 level และมีขนาดเล็ก (~1,000 แถว) — โหลดมาทั้งหมดเลย
        // ง่ายกว่าไล่ parent_id ทีละ query ต่อ level
        $categoriesById = Category::all(['id', 'name', 'parent_id'])->keyBy('id');

        return $assignedCategoryId->map(function (int $categoryId) use ($categoriesById) {
            $category = $categoriesById->get($categoryId);
            while ($category?->parent_id && $categoriesById->has($category->parent_id)) {
                $category = $categoriesById->get($category->parent_id);
            }

            return $category?->name;
        })->filter();
    }

    /**
     * จะใช้ข้อความไทยที่ hardcode ไว้เป็น fallback ก็ต่อเมื่อตัว attribute เอง
     * (หรือชื่อของมัน) หายไปแบบผิดปกติเท่านั้น — label จริงจะมาจาก $labelsByCode
     * (Attribute::name คือหน้าจัดการ Attribute) ด้านล่างเสมอ
     */
    private const SPEC_LABEL_FALLBACKS = [
        'spec_specifications' => 'ข้อมูลจำเพาะ',
        'spec_packaging' => 'บรรจุภัณฑ์',
        'spec_accessories' => 'อุปกรณ์เสริม',
        'how_to_use' => 'วิธีใช้งาน',
        'warnings' => 'คำเตือน',
        'warranty_period' => 'การรับประกัน',
    ];

    /**
     * @param  array<int, string>  $allowedCodes  code จาก self::CODES ที่ผู้ดูมีสิทธิ์เห็น
     *                                             (ดูคำอธิบาย $viewer ใน mapMany()) ค่าของ
     *                                             code อื่นๆ นอกเหนือจากนี้จะถูกเคลียร์เป็นว่าง
     *                                             ด้านล่าง เพื่อไม่ให้ข้อมูลที่ถูกจำกัดไปถึง
     *                                             ผลลัพธ์ที่ map แล้วเลยแม้แต่นิดเดียว — ไม่ใช่
     *                                             แค่ซ่อนไว้ฝั่ง client เท่านั้น
     * @param  Collection<string, string>  $labelsByCode  code => Attribute::name ใช้สำหรับ
     *                                                     label ของแถวในตาราง specs เพื่อให้
     *                                                     สะท้อนสิ่งที่แอดมินตั้งค่าไว้จริงๆ
     *                                                     ไม่ใช่ข้อความที่ฝังไว้ในคลาสนี้
     */
    private static function mapOne(Product $product, Collection $values, ?string $categoryName, array $allowedCodes, Collection $labelsByCode): array
    {
        $get = fn (string $code) => in_array($code, $allowedCodes, true) ? ($values->get($code) ?: null) : null;
        $specLabel = fn (string $code) => $labelsByCode->get($code) ?: self::SPEC_LABEL_FALLBACKS[$code];

        $price = (float) ($get('price_std') ?? $get('price_recommend') ?? 0);

        $specs = array_filter([
            $specLabel('spec_specifications') => self::plainText($get('spec_specifications')),
            $specLabel('spec_packaging') => self::plainText($get('spec_packaging')),
            $specLabel('spec_accessories') => self::plainText($get('spec_accessories')),
            $specLabel('how_to_use') => self::plainText($get('how_to_use')),
            $specLabel('warnings') => self::plainText($get('warnings')),
            $specLabel('warranty_period') => $get('warranty_period') ? $get('warranty_period').' เดือน' : null,
        ]);

        $result = [
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => $get('pname') ?? $product->sku,
            'brand' => $get('pbrand') ?? '-',
            'category' => $categoryName ?? $get('pcatname') ?? 'ทั่วไป',
            'size' => $get('unitinfo') ?? '',
            'packUnit' => $get('pbaseunit') ?? 'ชิ้น',
            'packQty' => (int) ($get('packaging_box') ?? 1),
            'price' => $price,
            'description' => self::plainText($get('product_details_features')) ?? '-',
            'highlights' => self::toLines($get('spec_features')),
            'specs' => $specs,
            // price_std กับ packaging_box ตอนนี้อยู่คนละ Attribute Group กันแล้ว
            // (Pricing กับ Packaging ถูกแยกออกมาจาก group รวมเดิม) และจำกัดสิทธิ์
            // แยกกันได้อิสระ — แต่ละ flag จะบอกฝั่ง frontend ว่าควร render tile นั้น
            // เลยไหม แทนที่จะโชว์ค่า fallback หลอกๆ อย่าง 0/1
            'canViewPricing' => in_array('price_std', $allowedCodes, true),
            'canViewPackaging' => in_array('packaging_box', $allowedCodes, true),
        ];

        if ($imagePath = $get('pimage')) {
            $result['image'] = AttributeValueFormatter::resolveStorageUrl($imagePath);
        }

        if ($get('eol') === '1') {
            $result['tag'] = 'เลิกผลิต';
            $result['tagColor'] = 'error';
        }

        return $result;
    }

    private static function plainText(?string $html): ?string
    {
        if (!$html) {
            return null;
        }

        $text = trim(strip_tags($html));

        return $text !== '' ? $text : null;
    }

    private static function toLines(?string $html): array
    {
        if (!$html) {
            return [];
        }

        $text = str_replace(['<li>', '<br>', '<br/>', '<br />'], "\n", $html);
        $text = strip_tags($text);

        return collect(explode("\n", $text))
            ->map(fn ($line) => trim($line))
            ->filter()
            ->values()
            ->all();
    }
}
