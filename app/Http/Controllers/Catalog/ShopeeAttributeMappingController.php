<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeSellerAccount;
use App\Services\Shopee\ShopeeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * ให้แอดมินเลือกได้ว่าจะเอา PIM attribute ตัวไหนมาเติมลงฟิลด์ที่จะส่งไป Shopee
 * โดยไม่ต้องแก้โค้ด — ดูที่ ShopeeProductSyncService::buildPayload()/
 * resolveMappedField() (สำหรับฟิลด์ที่มีโครงสร้างชัดเจน) และ resolveAttributes()
 * (`shopee_attribute` พฤติกรรมเดิมแบบใช้ attribute_list อย่างเดียว) ซึ่งจะอ่านจาก
 * ตารางนี้แทนที่จะไป lookup แบบ hardcode เดิมอย่าง pname/price_std/qty/weight_pcs/
 * product_details_features/attribute_6/length_pcs/width_pcs/height_pcs
 * เวอร์ชัน 1 รองรับแค่ Shopee attribute แบบพิมพ์ข้อความอิสระ (input_type
 * FREE_TEXT_FILED = 3) สำหรับ target แบบ `shopee_attribute` เท่านั้น — ส่วน attribute
 * แบบ select/dropdown ต้องใช้ value_id เฉพาะเจาะจง ไม่ใช่ข้อความอิสระ เลยแค่ sync มาโชว์
 * ให้เห็น แต่ยังเลือกมาเป็น target การแมปตรงนี้ไม่ได้
 *
 * index() แบบ read-only ที่เคยอยู่ในนี้ ตอนนี้ย้ายไปอยู่ที่
 * MarketplaceAttributeMappingController แล้ว (รวมกับของ WooCommerce/Lazada/
 * TikTok ไว้ใน Inertia response เดียวกัน สำหรับหน้าแท็บรวม
 * "จับคู่เนื้อหา Marketplace") — controller นี้เลยเหลือแค่ action ที่เขียนข้อมูลเท่านั้น
 */
class ShopeeAttributeMappingController extends Controller
{
    private const MAPPABLE_INPUT_TYPE = 3; // FREE_TEXT_FILED (แบบพิมพ์ข้อความอิสระ)

    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video',
        'shopee_attribute',
    ];

    public function update(Request $request): RedirectResponse|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.target_field' => ['nullable', Rule::in(self::TARGET_FIELDS)],
            'mappings.*.shopee_attribute_id' => ['nullable', 'integer', 'exists:shopee_attributes,id'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $entries = (array) $request->input('mappings', []);

            $shopeeAttributesById = ShopeeAttribute::whereIn(
                'id',
                collect($entries)->pluck('shopee_attribute_id')->filter()
            )->get()->keyBy('id');

            // video_upload_id ของ Shopee ต้องการไฟล์วิดีโอที่อัปโหลดจริงๆ
            // (ดูที่ ShopeeClient::uploadVideo() ซึ่งจะโหลด URL ที่แมปไว้ตรงนี้มา
            // แล้วอัปโหลดขึ้นไปใหม่เป็นไฟล์วิดีโอ) — ข้อจำกัดเดียวกับที่ฟิลด์วิดีโอของ
            // Lazada/TikTok บังคับใช้ หลังจากเคยมีปัญหาตอน push จริงเพราะดันแมป
            // attribute ที่เป็นข้อความ/URL ธรรมดา (เช่น youtube_url) แทนที่จะเป็นไฟล์
            // ที่อัปโหลดไว้
            $attributesById = Attribute::whereIn(
                'id',
                collect($entries)->pluck('attribute_id')->filter()
            )->get()->keyBy('id');

            foreach ($entries as $index => $entry) {
                $isShopeeAttribute = ($entry['target_field'] ?? null) === 'shopee_attribute';
                $shopeeAttributeId = $entry['shopee_attribute_id'] ?? null;

                if ($isShopeeAttribute && !$shopeeAttributeId) {
                    $validator->errors()->add("mappings.{$index}.shopee_attribute_id", 'A Shopee attribute must be chosen for this mapping.');
                    continue;
                }
                if (!$isShopeeAttribute && $shopeeAttributeId) {
                    $validator->errors()->add("mappings.{$index}.shopee_attribute_id", 'Only valid when target_field is shopee_attribute.');
                    continue;
                }

                if (($entry['target_field'] ?? null) === 'video') {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    if ($attribute && $attribute->type !== 'video') {
                        $validator->errors()->add(
                            "mappings.{$index}.target_field",
                            "Shopee's video field expects an uploaded file, not an external URL — only a video-type PIM attribute can be mapped here."
                        );
                    }
                }

                if (!$shopeeAttributeId) {
                    continue;
                }

                $target = $shopeeAttributesById->get($shopeeAttributeId);
                if ($target && (int) $target->input_type !== self::MAPPABLE_INPUT_TYPE) {
                    $validator->errors()->add(
                        "mappings.{$index}.shopee_attribute_id",
                        'Only free-text Shopee attributes can be mapped yet.'
                    );
                }
            }
        });

        $validated = $validator->validate();

        foreach ($validated['mappings'] as $entry) {
            if (empty($entry['target_field'])) {
                ShopeeAttributeMapping::where('attribute_id', $entry['attribute_id'])->delete();
                continue;
            }

            $mapping = ShopeeAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->target_field = $entry['target_field'];
            $mapping->shopee_attribute_id = $entry['shopee_attribute_id'] ?? null;
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        ShopeeAttributeMapping::bumpListVersion();

        // ตัวเลือกรายหมวดหมู่ที่ฝังอยู่ในหน้า categories/shopee-mapping.tsx จะเรียก
        // endpoint นี้ผ่าน fetch ธรรมดา (Accept: application/json) แทนที่จะเป็นการ
        // visit แบบ Inertia — ดูเหตุผลได้ที่ branch แบบเดียวกันใน
        // BrandController::bulkMapMarketplaceBrand() ส่วนตัวเรียกอื่นๆ ที่เหลือเป็น
        // Inertia POST จริงๆ ไม่ได้รับผลกระทบ
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return back()->with('success', 'Shopee attribute mapping saved.');
    }

    /**
     * ดึงโครงสร้าง attribute จริงจาก Shopee เข้ามา (แค่อ่านอย่างเดียว ไม่ได้เขียนกลับไป)
     * สำหรับทุกหมวดหมู่ PIM ที่แมปกับ shopee_category_id ไว้แล้ว โดยแบ่งดึงทีละ 20
     * ตามค่า max ที่ get_attribute_tree รองรับตามเอกสาร แล้วตัดตัวซ้ำด้วย attribute_id
     * รวมทุกหมวดหมู่ (เทสจริงเมื่อ 2026-08-14 แล้วยืนยันว่า id เดียวกันข้ามหมวดหมู่ได้
     * ค่าเดิมเสมอ) ส่วนการหา account ใช้ตามแบบ
     * CategoryController::syncShopeeCategories()
     */
    public function syncShopeeAttributes(): RedirectResponse
    {
        $account = ShopeeSellerAccount::first();
        if (!$account) {
            return back()->with('error', 'No Shopee seller account found to authenticate the sync.');
        }

        $categoryIds = Category::whereNotNull('shopee_category_id')
            ->distinct()
            ->pluck('shopee_category_id')
            ->all();

        if (empty($categoryIds)) {
            return back()->with('error', 'No PIM category is mapped to a Shopee category yet — nothing to sync attributes for.');
        }

        $client = new ShopeeClient($account);
        $rowsById = [];

        foreach (array_chunk($categoryIds, 20) as $chunk) {
            $response = $client->getAttributeTree($chunk);

            foreach ($response['response']['list'] ?? [] as $categoryResult) {
                foreach ($categoryResult['attribute_tree'] ?? [] as $attr) {
                    $rowsById[$attr['attribute_id']] = [
                        'id' => $attr['attribute_id'],
                        'name' => $attr['name'],
                        'input_type' => $attr['attribute_info']['input_type'] ?? null,
                    ];
                }
            }
        }

        $now = now();
        foreach (array_chunk(array_values($rowsById), 500) as $chunk) {
            ShopeeAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['name', 'input_type', 'updated_at']
            );
        }

        ShopeeAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsById).' Shopee attributes.');
    }

    /**
     * แนวคิดเดียวกับ syncShopeeAttributes() ด้านบน แต่ทำแค่หมวดหมู่ Shopee เดียว —
     * เป็น action "Sync Attributes" บนหน้า categories/shopee-mapping.tsx ที่อยู่ข้างๆ
     * กับ action แถว "Sync brand" แบบเดียวกันของหน้านั้น (ดู
     * BrandController::syncShopeeBrandsForCategory()) ต่างจากแบรนด์ตรงที่
     * get_attribute_tree ไม่มี pagination และโครงสร้างของแต่ละหมวดหมู่ก็เล็ก
     * (แค่หลักหน่วยถึงหลักสิบกว่าแถว ไม่ใช่หลักพัน) เลยรันแบบ synchronous
     * ในตัว request เลยได้ ไม่ต้องใช้ JobTracker/queue
     */
    public function syncShopeeAttributesForCategory(Request $request): JsonResponse
    {
        $account = ShopeeSellerAccount::first();
        if (! $account) {
            return response()->json(['message' => 'No Shopee seller account found to authenticate the sync.'], 422);
        }

        $validated = $request->validate([
            'shopee_category_id' => ['required', 'integer', 'exists:shopee_categories,id'],
        ]);
        $categoryId = $validated['shopee_category_id'];

        $client = new ShopeeClient($account);
        $response = $client->getAttributeTree([$categoryId]);
        $tree = $response['response']['list'][0]['attribute_tree'] ?? [];

        $now = now();
        $rows = array_map(fn (array $attr) => [
            'id' => $attr['attribute_id'],
            'name' => $attr['name'],
            'input_type' => $attr['attribute_info']['input_type'] ?? null,
            'category_id' => $categoryId,
            'mandatory' => (bool) ($attr['mandatory'] ?? false),
            'created_at' => $now,
            'updated_at' => $now,
        ], $tree);

        if ($rows !== []) {
            ShopeeAttribute::upsert($rows, ['id'], ['name', 'input_type', 'category_id', 'mandatory', 'updated_at']);
        }

        ShopeeAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * Shopee attribute ที่แคชไว้สำหรับหมวดหมู่หนึ่งๆ (ดูหมายเหตุใน migration ที่บอกว่า
     * คอลัมน์นี้ "ใช้บอกข้อมูลเฉยๆ ไม่ใช่ FK จริง" — ที่ list ออกมาก็คือสิ่งที่ sync ล่าสุด
     * ของหมวดหมู่นั้นเจอจริงๆ) แต่ละตัวจะแนบมาด้วยว่า PIM attribute ไหนแมปอยู่ (ถ้ามี)
     * เป็นข้อมูลหนุนหลังตารางคอลัมน์แบบเดียวกับ "จับคู่แบรนด์กับ PIM" บนหน้า
     * categories/shopee-mapping.tsx — ทำงานเหมือนกับ
     * BrandController::shopeeBrandsForCategory() เป๊ะๆ
     */
    public function shopeeAttributesForCategory(int $shopeeCategoryId): JsonResponse
    {
        $attributes = ShopeeAttribute::where('category_id', $shopeeCategoryId)->orderBy('name')->get();

        $mappedByShopeeAttributeId = ShopeeAttributeMapping::whereIn('shopee_attribute_id', $attributes->pluck('id'))
            ->with('attribute:id,name')
            ->get()
            ->keyBy('shopee_attribute_id');

        $data = $attributes->map(function (ShopeeAttribute $attribute) use ($mappedByShopeeAttributeId) {
            $mapping = $mappedByShopeeAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'input_type' => $attribute->input_type,
                'mandatory' => (bool) $attribute->mandatory,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
    }

    /**
     * endpoint สำหรับค้นหาที่หนุนหลัง Autocomplete ของ PIM attribute ในตารางเดียวกันนี้
     * — เป็นภาพสะท้อนกลับด้านของ BrandController::searchPimBrands() คือตัวนั้น
     * ค้นหาตัวเลือกแบรนด์ของ PIM ส่วนตัวนี้ค้นหา PIM attribute จาก label เพราะที่นี่
     * การแมปก็เริ่มจากฝั่ง Shopee เหมือนกัน (เลือก PIM attribute ให้กับแถว Shopee
     * attribute หนึ่งๆ) ไม่ใช่เลือกกลับด้าน
     */
    public function searchPimAttributes(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $attributes = Attribute::query()
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($q2) use ($query) {
                    $q2->where('name', 'like', "%{$query}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$query}%"));
                });
            })
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name']);

        return response()->json(['data' => $attributes->map(fn (Attribute $a) => ['id' => $a->id, 'name' => $a->name])]);
    }
}
