<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaSellerAccount;
use App\Services\Lazada\LazadaClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * ให้แอดมินเลือกได้ว่าจะเอา PIM attribute ตัวไหนมาเติมลงฟิลด์ที่จะส่งไป Lazada
 * โดยไม่ต้องแก้โค้ด — ดูที่ LazadaProductSyncService::buildPayload()/
 * resolveMappedField() (สำหรับฟิลด์ที่มีโครงสร้างชัดเจน) และ resolveMappedAttributes()
 * (`lazada_attribute` — คือ payload.attributes ตอน attribute_type=normal /
 * ฟิลด์ SKU ตอน attribute_type=sku ซึ่งเป็นพฤติกรรมเดิม) ซึ่งจะอ่านจากตารางนี้แทนที่
 * จะไป lookup แบบ hardcode เดิมอย่าง pname/price_std/qty/attribute_6/
 * SKU_FIELD_SOURCE เวอร์ชัน 1 รองรับแค่ attribute ที่กรอกค่าอิสระได้
 * (input_type เป็น text/numeric) สำหรับ target แบบ `lazada_attribute` เท่านั้น —
 * ส่วน singleSelect/multiSelect ต้องเลือกจากตัวเลือกที่กำหนดไว้ล่วงหน้า ไม่ใช่ค่า
 * อิสระ เลยแค่ sync มาโชว์ให้เห็น แต่ยังเลือกมาเป็น target การแมปตรงนี้ไม่ได้
 * (ตัดสินใจแบบเดียวกับที่เคยทำไว้ในหน้าของ Shopee)
 *
 * index() แบบ read-only ที่เคยอยู่ในนี้ ตอนนี้ย้ายไปอยู่ที่
 * MarketplaceAttributeMappingController แล้ว (รวมกับของ WooCommerce/Shopee/
 * TikTok ไว้ใน Inertia response เดียวกัน สำหรับหน้าแท็บรวม
 * "จับคู่เนื้อหา Marketplace") — controller นี้เลยเหลือแค่ action ที่เขียนข้อมูลเท่านั้น
 */
class LazadaAttributeMappingController extends Controller
{
    // ใช้แบบ allowlist (ปฏิเสธทุกอย่างที่ยังไม่ได้ยืนยันชัดๆ ว่าปลอดภัย) เป็นค่าเริ่มต้น
    // แบบระมัดระวังแบบเดียวกับที่ใช้ทั่วทั้งแอปในส่วน integration ของ marketplace
    // ฟิลด์ richText (เช่น description/short_description — เช็คจากของจริงแล้วเมื่อ
    // 2026-08-21 ผ่าน category schema ที่ sync มาจริง) รับ HTML จริงๆ ได้
    // เหมือนกับ PIM attribute แบบ `textarea` ของแอปนี้เองที่ตรวจสอบแล้วว่าเก็บได้ —
    // ดู LazadaProductSyncService ซึ่งจะส่งค่าที่แมปไว้ผ่านตรงๆ ทั้งสองแบบอยู่ดี ส่วน
    // enumInput/singleSelect/multiSelect/multiEnumInput/img/date ยังแมปไม่ได้:
    // เพราะต้องใช้ตัวเลือกที่กำหนดไว้ล่วงหน้า หรือมีรูปแบบที่ไม่ใช่ string ซึ่งหน้านี้
    // ยังไม่รองรับ
    private const MAPPABLE_INPUT_TYPES = ['text', 'numeric', 'richText'];

    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'video',
        'lazada_attribute',
    ];

    public function update(Request $request): RedirectResponse|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.target_field' => ['nullable', Rule::in(self::TARGET_FIELDS)],
            'mappings.*.lazada_attribute_name' => ['nullable', 'string', 'exists:lazada_attributes,name'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $entries = (array) $request->input('mappings', []);

            $lazadaAttributesByName = LazadaAttribute::whereIn(
                'name',
                collect($entries)->pluck('lazada_attribute_name')->filter()
            )->get()->keyBy('name');

            // Lazada จะปฏิเสธ URL วิดีโอจากภายนอกเสมอ (เช็คจากของจริงแล้ว เจอ error
            // BIZ_CHECK_EXTERNAL_VIDEO_IS_FORBIDDEN) — มีแค่ PIM attribute ประเภท
            // `video` เท่านั้น (คือไฟล์ที่อัปโหลดไว้ เช่น attribute_6) ที่จะแมปเข้ากับ
            // target_field='video' ได้ ห้ามแมป attribute ที่เป็นข้อความ/URL ธรรมดา
            // อย่าง youtube_url เด็ดขาด ดูเหตุผลเพิ่มเติมได้ที่ docblock ของ class นี้
            // และ migration ที่เปิดฟิลด์นี้ขึ้นมาใหม่
            $attributesById = Attribute::whereIn(
                'id',
                collect($entries)->pluck('attribute_id')->filter()
            )->get()->keyBy('id');

            foreach ($entries as $index => $entry) {
                $isLazadaAttribute = ($entry['target_field'] ?? null) === 'lazada_attribute';
                $lazadaAttributeName = $entry['lazada_attribute_name'] ?? null;

                if ($isLazadaAttribute && !$lazadaAttributeName) {
                    $validator->errors()->add("mappings.{$index}.lazada_attribute_name", 'A Lazada attribute must be chosen for this mapping.');
                    continue;
                }
                if (!$isLazadaAttribute && $lazadaAttributeName) {
                    $validator->errors()->add("mappings.{$index}.lazada_attribute_name", 'Only valid when target_field is lazada_attribute.');
                    continue;
                }

                if (($entry['target_field'] ?? null) === 'video') {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    if ($attribute && $attribute->type !== 'video') {
                        $validator->errors()->add(
                            "mappings.{$index}.target_field",
                            'Lazada rejects external video URLs — only a video-type PIM attribute can be mapped here.'
                        );
                    }
                }

                if (!$lazadaAttributeName) {
                    continue;
                }

                $target = $lazadaAttributesByName->get($lazadaAttributeName);
                if ($target && !in_array($target->input_type, self::MAPPABLE_INPUT_TYPES, true)) {
                    $validator->errors()->add(
                        "mappings.{$index}.lazada_attribute_name",
                        'Only free-text/numeric Lazada attributes can be mapped yet.'
                    );
                }
            }
        });

        $validated = $validator->validate();

        foreach ($validated['mappings'] as $entry) {
            if (empty($entry['target_field'])) {
                // ลบทีละแถวผ่าน model ให้ event `deleted` ของ Auditable ทำงาน —
                // `->where()->delete()` แบบ mass delete จะข้าม event ทำให้การ
                // ยกเลิกการแมปไม่ถูกบันทึกลง audit_logs
                LazadaAttributeMapping::where('attribute_id', $entry['attribute_id'])->get()->each->delete();
                continue;
            }

            $mapping = LazadaAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->target_field = $entry['target_field'];
            $mapping->lazada_attribute_name = $entry['lazada_attribute_name'] ?? null;
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        LazadaAttributeMapping::bumpListVersion();

        // ตัวเลือกรายหมวดหมู่ที่ฝังอยู่ในหน้า categories/lazada-mapping.tsx จะเรียก
        // endpoint นี้ผ่าน fetch ธรรมดา (Accept: application/json) แทนที่จะเป็นการ
        // visit แบบ Inertia — ดูเหตุผลได้ที่ branch แบบเดียวกันใน
        // ShopeeAttributeMappingController::update() ส่วนตัวเรียกอื่นๆ ที่เหลือเป็น
        // Inertia POST จริงๆ ไม่ได้รับผลกระทบ
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return back()->with('success', 'Lazada attribute mapping saved.');
    }

    /**
     * ดึงโครงสร้าง attribute ของหมวดหมู่จริงจาก Lazada เข้ามา (แค่อ่านอย่างเดียว
     * ไม่ได้เขียนกลับไป) สำหรับทุกหมวดหมู่ PIM ที่แมปกับ lazada_category_id ไว้แล้ว
     * โดยเรียก /category/attributes/get ทีละ 1 ครั้งต่อ 1 หมวดหมู่ (ต่างจาก
     * get_attribute_tree ของ Shopee ตรงที่ endpoint นี้รับ primary_category_id
     * เดียวเท่านั้น ไม่ใช่ list แบบ batch) ตัดตัวซ้ำด้วย `name` ของ attribute รวมทุก
     * หมวดหมู่ มีการหน่วงเวลาสั้นๆ ระหว่างแต่ละ call — rate limit ต่อ account ของ
     * Lazada (error "901: too frequent") เคยเจอมาแล้วจริงๆ ว่าเกิดขึ้นได้แค่จาก
     * การเรียกติดๆ กันไม่กี่ครั้ง (ดูข้อค้นพบเดียวกันที่ docblock ของ
     * LazadaProductSyncService::syncLiveStatus()) และตรงนี้จะเรียก 1 ครั้งต่อ 1
     * หมวดหมู่ที่แมปไว้
     */
    public function syncLazadaAttributes(): RedirectResponse
    {
        $account = LazadaSellerAccount::active()->first();
        if (!$account) {
            return back()->with('error', 'No active Lazada seller account found to authenticate the sync.');
        }

        $categoryIds = Category::whereNotNull('lazada_category_id')
            ->distinct()
            ->pluck('lazada_category_id')
            ->all();

        if (empty($categoryIds)) {
            return back()->with('error', 'No PIM category is mapped to a Lazada category yet — nothing to sync attributes for.');
        }

        $client = new LazadaClient($account);
        $rowsByName = [];

        foreach ($categoryIds as $index => $categoryId) {
            $response = $client->getCategoryAttributes((int) $categoryId);

            foreach ($response['data'] ?? [] as $attr) {
                $rowsByName[$attr['name']] = [
                    'name' => $attr['name'],
                    'label' => $attr['label'] ?? $attr['name'],
                    'input_type' => $attr['input_type'] ?? null,
                    'attribute_type' => $attr['attribute_type'] ?? null,
                ];
            }

            if ($index < count($categoryIds) - 1) {
                usleep(300_000);
            }
        }

        $now = now();
        foreach (array_chunk(array_values($rowsByName), 500) as $chunk) {
            LazadaAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['name'],
                ['label', 'input_type', 'attribute_type', 'updated_at']
            );
        }

        LazadaAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsByName).' Lazada attributes across '.count($categoryIds).' categories.');
    }

    /**
     * แนวคิดเดียวกับ syncLazadaAttributes() ด้านบน แต่ทำแค่หมวดหมู่ Lazada เดียว —
     * เป็น action "Sync attributes" บนหน้า categories/lazada-mapping.tsx ที่อยู่ข้างๆ
     * กับตาราง Categories ของหน้านั้น (ดู
     * ShopeeAttributeMappingController::syncShopeeAttributesForCategory()
     * ที่เป็นแบบเดียวกันฝั่ง Shopee ที่ตัวนี้เลียนแบบมา) รันแบบ synchronous — เรียก
     * /category/attributes/get แค่ครั้งเดียว เหมือนกับแต่ละรอบ loop ต่อหมวดหมู่ด้านบน
     * แค่ไม่ต้องหน่วงเวลากันเรียกถี่เกินหลายหมวดหมู่ เพราะตรงนี้เรียกแค่ครั้งเดียว
     */
    public function syncLazadaAttributesForCategory(Request $request): JsonResponse
    {
        $account = LazadaSellerAccount::active()->first();
        if (! $account) {
            return response()->json(['message' => 'No active Lazada seller account found to authenticate the sync.'], 422);
        }

        $validated = $request->validate([
            'lazada_category_id' => ['required', 'integer', 'exists:lazada_categories,id'],
        ]);
        $categoryId = $validated['lazada_category_id'];

        $client = new LazadaClient($account);
        $response = $client->getCategoryAttributes($categoryId);
        $schema = $response['data'] ?? [];

        $now = now();
        $rows = array_map(fn (array $attr) => [
            'name' => $attr['name'],
            'label' => $attr['label'] ?? $attr['name'],
            'input_type' => $attr['input_type'] ?? null,
            'attribute_type' => $attr['attribute_type'] ?? null,
            'category_id' => $categoryId,
            'mandatory' => (bool) ($attr['is_mandatory'] ?? false),
            'created_at' => $now,
            'updated_at' => $now,
        ], $schema);

        if ($rows !== []) {
            LazadaAttribute::upsert($rows, ['name'], ['label', 'input_type', 'attribute_type', 'category_id', 'mandatory', 'updated_at']);
        }

        LazadaAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * Lazada attribute ที่แคชไว้สำหรับหมวดหมู่หนึ่งๆ (ดูหมายเหตุใน migration ที่บอกว่า
     * คอลัมน์นี้ "ใช้บอกข้อมูลเฉยๆ ไม่ใช่ FK จริง" — ที่ list ออกมาก็คือสิ่งที่ sync ล่าสุด
     * ของหมวดหมู่นั้นเจอจริงๆ) แต่ละตัวจะแนบมาด้วยว่า PIM attribute ไหนแมปอยู่ (ถ้ามี)
     * เป็นข้อมูลหนุนหลังตารางคอลัมน์ "จับคู่แอตทริบิวต์กับ PIM" บนหน้า
     * categories/lazada-mapping.tsx — ทำงานเหมือนกับ
     * ShopeeAttributeMappingController::shopeeAttributesForCategory() เป๊ะๆ
     * แค่ใช้ `name` เป็น key แทนที่จะเป็น id ตัวเลข (ดูเหตุผลได้ที่ docblock ของ
     * LazadaAttribute)
     */
    public function lazadaAttributesForCategory(int $lazadaCategoryId): JsonResponse
    {
        $attributes = LazadaAttribute::where('category_id', $lazadaCategoryId)->orderBy('label')->get();

        $mappedByLazadaAttributeName = LazadaAttributeMapping::whereIn('lazada_attribute_name', $attributes->pluck('name'))
            ->with('attribute:id,name')
            ->get()
            ->keyBy('lazada_attribute_name');

        $data = $attributes->map(function (LazadaAttribute $attribute) use ($mappedByLazadaAttributeName) {
            $mapping = $mappedByLazadaAttributeName->get($attribute->name);

            return [
                'name' => $attribute->name,
                'label' => $attribute->label,
                'input_type' => $attribute->input_type,
                'mandatory' => (bool) $attribute->mandatory,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
    }
}
