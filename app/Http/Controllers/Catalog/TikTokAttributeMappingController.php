<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokSellerAccount;
use App\Services\TikTok\TikTokClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * ให้แอดมินเลือกได้ว่าจะเอา PIM attribute ตัวไหนมาเติมลงฟิลด์ที่จะส่งไป TikTok
 * โดยไม่ต้องแก้โค้ด — ดูที่ TikTokProductSyncService::buildPayload()/
 * resolveMappedField() (สำหรับฟิลด์ที่มีโครงสร้างชัดเจน) และ resolveProductAttributes()
 * (`tiktok_attribute` พฤติกรรมเดิม) ซึ่งจะอ่านจากตารางนี้แทนที่จะไป lookup แบบ
 * hardcode เดิมอย่าง pname/price_std/qty/weight_pcs/product_details_features/
 * attribute_6/DIMENSION_FIELD_SOURCE เวอร์ชัน 1 รองรับแค่ attribute ที่ TikTok
 * เองติดแฟล็ก `is_customizable` ไว้ (คือผู้ขายพิมพ์ค่าเองได้อิสระ) สำหรับ target แบบ
 * `tiktok_attribute` เท่านั้น — attribute ที่ไม่มีแฟล็กนี้ต้องเลือกค่าจาก list
 * `values[]` ของ TikKok เองเท่านั้น ไม่ใช่ค่าอิสระ เลยแค่ sync มาโชว์ให้เห็น
 * แต่ยังเลือกมาเป็น target การแมปตรงนี้ไม่ได้ (ตัดสินใจแบบเดียวกับที่เคยทำไว้ในหน้า
 * ของ Shopee/Lazada)
 *
 * index() แบบ read-only ที่เคยอยู่ในนี้ ตอนนี้ย้ายไปอยู่ที่
 * MarketplaceAttributeMappingController แล้ว (รวมกับของ WooCommerce/Shopee/
 * Lazada ไว้ใน Inertia response เดียวกัน สำหรับหน้าแท็บรวม
 * "จับคู่แอตทริบิวต์ Marketplace") — controller นี้เลยเหลือแค่ action ที่เขียนข้อมูลเท่านั้น
 */
class TikTokAttributeMappingController extends Controller
{
    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video',
        'tiktok_attribute',
    ];

    public function update(Request $request): RedirectResponse|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.target_field' => ['nullable', Rule::in(self::TARGET_FIELDS)],
            'mappings.*.tiktok_attribute_id' => ['nullable', 'string', 'exists:tiktok_attributes,id'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $entries = (array) $request->input('mappings', []);

            $tiktokAttributesById = TikTokAttribute::whereIn(
                'id',
                collect($entries)->pluck('tiktok_attribute_id')->filter()
            )->get()->keyBy('id');

            // ข้อจำกัดเรื่อง URL วิดีโอจากภายนอกแบบเดียวกับฟิลด์วิดีโอของ Lazada
            // (ดู docblock ของ LazadaAttributeMappingController สำหรับเหตุการณ์จริง
            // ที่ตรงนี้ป้องกันไม่ให้เกิดซ้ำ) — มีแค่ PIM attribute ประเภท `video`
            // เท่านั้นที่จะแมปเข้ากับ target_field='video' ได้
            $attributesById = Attribute::whereIn(
                'id',
                collect($entries)->pluck('attribute_id')->filter()
            )->get()->keyBy('id');

            foreach ($entries as $index => $entry) {
                $isTiktokAttribute = ($entry['target_field'] ?? null) === 'tiktok_attribute';
                $tiktokAttributeId = $entry['tiktok_attribute_id'] ?? null;

                if ($isTiktokAttribute && !$tiktokAttributeId) {
                    $validator->errors()->add("mappings.{$index}.tiktok_attribute_id", 'A TikTok attribute must be chosen for this mapping.');
                    continue;
                }
                if (!$isTiktokAttribute && $tiktokAttributeId) {
                    $validator->errors()->add("mappings.{$index}.tiktok_attribute_id", 'Only valid when target_field is tiktok_attribute.');
                    continue;
                }

                if (($entry['target_field'] ?? null) === 'video') {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    if ($attribute && $attribute->type !== 'video') {
                        $validator->errors()->add(
                            "mappings.{$index}.target_field",
                            "TikTok's video field expects an uploaded file, not an external URL — only a video-type PIM attribute can be mapped here."
                        );
                    }
                }

                if (!$tiktokAttributeId) {
                    continue;
                }

                $target = $tiktokAttributesById->get($tiktokAttributeId);
                if ($target && !$target->is_customizable) {
                    $validator->errors()->add(
                        "mappings.{$index}.tiktok_attribute_id",
                        'Only customizable (free-value) TikTok attributes can be mapped yet.'
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
                TikTokAttributeMapping::where('attribute_id', $entry['attribute_id'])->get()->each->delete();
                continue;
            }

            $mapping = TikTokAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->target_field = $entry['target_field'];
            $mapping->tiktok_attribute_id = $entry['tiktok_attribute_id'] ?? null;
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        TikTokAttributeMapping::bumpListVersion();

        // ตัวเลือกรายหมวดหมู่ที่ฝังอยู่ในหน้า categories/tiktok-mapping.tsx จะเรียก
        // endpoint นี้ผ่าน fetch ธรรมดา (Accept: application/json) แทนที่จะเป็นการ
        // visit แบบ Inertia — ดูเหตุผลได้ที่ branch แบบเดียวกันใน
        // ShopeeAttributeMappingController::update() ส่วนตัวเรียกอื่นๆ ที่เหลือเป็น
        // Inertia POST จริงๆ ไม่ได้รับผลกระทบ
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return back()->with('success', 'TikTok attribute mapping saved.');
    }

    /**
     * ดึงโครงสร้าง attribute ของหมวดหมู่จริงจาก TikTok เข้ามา (แค่อ่านอย่างเดียว
     * ไม่ได้เขียนกลับไป) สำหรับทุกหมวดหมู่ PIM ที่แมปกับ tiktok_category_id ไว้แล้ว
     * โดยเรียก getAttributes() ทีละ 1 ครั้งต่อ 1 หมวดหมู่ (endpoint ของ TikTok รับ
     * category_id เดียวเท่านั้น ไม่ใช่ list แบบ batch เหมือนกับ /category/attributes/get
     * ของ Lazada) ตัดตัวซ้ำด้วย `id` ของ attribute รวมทุกหมวดหมู่ — ดูข้อควรระวัง
     * เรื่องนี้ได้ที่ docblock ของ migration มีการหน่วงเวลาสั้นๆ ระหว่างแต่ละ call
     * เป็นมาตรการป้องกันแบบเดียวกับ
     * LazadaAttributeMappingController::syncLazadaAttributes()
     */
    public function syncTikTokAttributes(): RedirectResponse
    {
        $account = TikTokSellerAccount::first();
        if (!$account) {
            return back()->with('error', 'No TikTok seller account found to authenticate the sync.');
        }

        $categoryIds = Category::whereNotNull('tiktok_category_id')
            ->distinct()
            ->pluck('tiktok_category_id')
            ->all();

        if (empty($categoryIds)) {
            return back()->with('error', 'No PIM category is mapped to a TikTok category yet — nothing to sync attributes for.');
        }

        $client = new TikTokClient($account);
        $rowsById = [];

        foreach ($categoryIds as $index => $categoryId) {
            $response = $client->getAttributes((string) $categoryId);

            foreach ($response['data']['attributes'] ?? [] as $attr) {
                if (($attr['type'] ?? null) !== 'PRODUCT_PROPERTY') {
                    continue;
                }

                $rowsById[$attr['id']] = [
                    'id' => $attr['id'],
                    'name' => $attr['name'],
                    'is_customizable' => (bool) ($attr['is_customizable'] ?? false),
                    'is_multiple_selection' => (bool) ($attr['is_multiple_selection'] ?? false),
                ];
            }

            if ($index < count($categoryIds) - 1) {
                usleep(300_000);
            }
        }

        $now = now();
        foreach (array_chunk(array_values($rowsById), 500) as $chunk) {
            TikTokAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['name', 'is_customizable', 'is_multiple_selection', 'updated_at']
            );
        }

        TikTokAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsById).' TikTok attributes across '.count($categoryIds).' categories.');
    }

    /**
     * แนวคิดเดียวกับ syncTikTokAttributes() ด้านบน แต่ทำแค่หมวดหมู่ TikTok เดียว —
     * เป็น action "Sync attributes" บนหน้า categories/tiktok-mapping.tsx เลียนแบบ
     * ShopeeAttributeMappingController::syncShopeeAttributesForCategory()/
     * LazadaAttributeMappingController::syncLazadaAttributesForCategory()
     * รันแบบ synchronous — เรียก getAttributes() แค่ครั้งเดียว เหมือนกับแต่ละรอบ
     * loop ต่อหมวดหมู่ด้านบน แค่ไม่ต้องหน่วงเวลากันเรียกถี่เกิน เพราะตรงนี้เรียกแค่
     * ครั้งเดียว
     */
    public function syncTikTokAttributesForCategory(Request $request): JsonResponse
    {
        $account = TikTokSellerAccount::first();
        if (! $account) {
            return response()->json(['message' => 'No TikTok seller account found to authenticate the sync.'], 422);
        }

        $validated = $request->validate([
            'tiktok_category_id' => ['required', 'integer', 'exists:tiktok_categories,id'],
        ]);
        $categoryId = $validated['tiktok_category_id'];

        $client = new TikTokClient($account);
        $response = $client->getAttributes((string) $categoryId);
        $schema = $response['data']['attributes'] ?? [];

        $now = now();
        $rows = [];
        foreach ($schema as $attr) {
            if (($attr['type'] ?? null) !== 'PRODUCT_PROPERTY') {
                continue;
            }

            $rows[] = [
                'id' => $attr['id'],
                'name' => $attr['name'],
                'is_customizable' => (bool) ($attr['is_customizable'] ?? false),
                'is_multiple_selection' => (bool) ($attr['is_multiple_selection'] ?? false),
                'category_id' => $categoryId,
                'mandatory' => (bool) ($attr['is_requried'] ?? false),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            TikTokAttribute::upsert($rows, ['id'], ['name', 'is_customizable', 'is_multiple_selection', 'category_id', 'mandatory', 'updated_at']);
        }

        TikTokAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * TikTok attribute ที่แคชไว้สำหรับหมวดหมู่หนึ่งๆ (ดูหมายเหตุใน migration ที่บอกว่า
     * คอลัมน์นี้ "ใช้บอกข้อมูลเฉยๆ ไม่ใช่ FK จริง" — ที่ list ออกมาก็คือสิ่งที่ sync ล่าสุด
     * ของหมวดหมู่นั้นเจอจริงๆ) แต่ละตัวจะแนบมาด้วยว่า PIM attribute ไหนแมปอยู่ (ถ้ามี)
     * เป็นข้อมูลหนุนหลังตารางคอลัมน์ "จับคู่ Attribute กับ PIM" บนหน้า
     * categories/tiktok-mapping.tsx — ทำงานเหมือนกับ
     * ShopeeAttributeMappingController::shopeeAttributesForCategory() เป๊ะๆ
     * แค่ใช้ `id` เป็น key (เป็น string ตามชนิด PK ของ TikTokAttribute เอง)
     */
    public function tiktokAttributesForCategory(int $tiktokCategoryId): JsonResponse
    {
        $attributes = TikTokAttribute::where('category_id', $tiktokCategoryId)->orderBy('name')->get();

        $mappedByTikTokAttributeId = TikTokAttributeMapping::whereIn('tiktok_attribute_id', $attributes->pluck('id'))
            ->with('attribute:id,name')
            ->get()
            ->keyBy('tiktok_attribute_id');

        $data = $attributes->map(function (TikTokAttribute $attribute) use ($mappedByTikTokAttributeId) {
            $mapping = $mappedByTikTokAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'is_customizable' => (bool) $attribute->is_customizable,
                'mandatory' => (bool) $attribute->mandatory,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
    }
}
