<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\ResolvesMarketplaceMasterCategory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\ProductValue;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokAttributeOptionMapping;
use App\Models\TikTokBrand;
use App\Models\TikTokCategory;
use App\Models\TikTokCategoryAttribute;
use App\Models\TikTokSellerAccount;
use App\Services\Catalog\TikTokAttributeFamilyGenerator;
use App\Services\Catalog\TikTokMappedAttributeCreator;
use App\Services\Catalog\TikTokMappingTimelineBuilder;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use App\Services\TikTok\TikTokClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * ให้แอดมินเลือกได้ว่าจะเอา PIM attribute ตัวไหนมาเติมลงฟิลด์ที่จะส่งไป TikTok
 * โดยไม่ต้องแก้โค้ด — ดูที่ TikTokProductSyncService::buildPayload()/
 * resolveMappedField() (สำหรับฟิลด์ที่มีโครงสร้างชัดเจน) และ resolveProductAttributes()
 * (`tiktok_attribute` พฤติกรรมเดิม) ซึ่งจะอ่านจากตารางนี้แทนที่จะไป lookup แบบ
 * hardcode เดิมอย่าง pname/price_std/qty/weight_pcs/product_details_features/
 * attribute_6/DIMENSION_FIELD_SOURCE
 *
 * v1 (เดิม) รองรับแค่ attribute ที่ TikTok เองติดแฟล็ก `is_customizable` ไว้
 * (คือผู้ขายพิมพ์ค่าเองได้อิสระ) — v2 (ตัวนี้, mirror ของ
 * ShopeeAttributeMappingController's select/dropdown ที่เพิ่งเปิดฝั่ง Shopee)
 * เปิดเพิ่ม attribute ที่ `is_customizable=false` ให้แมปได้ด้วย ต้องเลือกจาก
 * "ตัวเลือกที่กำหนดไว้ล่วงหน้า" (เก็บไว้ที่ tiktok_attributes.options — ดู
 * TikTokAttribute's docblock) จับคู่ผ่านตาราง tiktok_attribute_option_mappings
 * (ดู updateOptionMappings() ด้านล่าง) — ถูกส่งไป TikTok จริงตอน push แล้ว
 * เป็น `{id: value_id}` (ดู TikTokProductSyncService::resolveProductAttributes()'s
 * docblock) ต่างจาก Shopee ตอนเริ่มงานนั้นตรงที่ shape ของ `values[]` และการ
 * push จริงยืนยัน live มาก่อนงานนี้แล้วทั้งคู่ (ดู TikTokClient::getAttributes()'s
 * docblock) เลยรวมการส่งจริงไว้ตั้งแต่ v1 นี้เลย ไม่ต้องแยก decision ทีหลัง
 *
 * index() แบบ read-only ที่เคยอยู่ในนี้ ตอนนี้ย้ายไปอยู่ที่
 * MarketplaceAttributeMappingController แล้ว (รวมกับของ WooCommerce/Shopee/
 * Lazada ไว้ใน Inertia response เดียวกัน สำหรับหน้าแท็บรวม
 * "จับคู่แอตทริบิวต์ Marketplace") ส่วน tiktokProducts() ด้านล่าง (mirror ของ
 * ShopeeAttributeMappingController::shopeeProducts()) เป็นคนละหน้ากัน — หน้า
 * Object Page ต่อสินค้า (tiktok-products.tsx) ที่ไล่แมพ Category → Attribute
 * → Payload ตั้งแต่ตัวสินค้าเลย
 */
class TikTokAttributeMappingController extends Controller
{
    use ResolvesMarketplaceMasterCategory;
    // resolveMappedField()/resolveProductImageUrls() ด้านล่าง (ใช้ใน
    // productDetail()'s "ข้อมูลสินค้า (Platform)" tab) — ตัวเดียวกันเป๊ะกับที่
    // TikTokProductSyncService::buildPayload() ใช้ resolve ค่าจริงตอน push ไม่ใช่
    // เขียน logic ซ้ำเอง กันไม่ให้ preview กับของจริงเพี้ยนไปคนละทาง
    use ResolvesProductAttributeValues;

    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video',
        'tiktok_attribute',
    ];

    // ทุกค่าใน TARGET_FIELDS ยกเว้น 'tiktok_attribute' — ใช้กำหนดว่า section
    // "3. Payload TikTok" ของหน้า tiktok-products.tsx ต้อง render กี่แถว
    private const STRUCTURED_TARGET_FIELDS = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'];

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
                if (!$target) {
                    continue;
                }

                // เหตุผลเดียวกับ ShopeeAttributeMappingController::update()'s
                // select-type check — resolveProductAttributes() ทำงานได้ก็
                // ต่อเมื่อ source attribute มี AttributeOption ให้ resolve
                // จริง (คือต้องเป็น select/multiselect เท่านั้น) ไม่งั้นจะ
                // resolve ไม่เจอ option อะไรเลยเงียบๆ
                if (!$target->is_customizable) {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    $expectedType = $target->is_multiple_selection ? 'multiselect' : 'select';
                    if ($attribute && $attribute->type !== $expectedType) {
                        $validator->errors()->add(
                            "mappings.{$index}.tiktok_attribute_id",
                            "This TikTok field needs a predefined choice — only a {$expectedType}-type PIM attribute can be mapped here."
                        );
                    }
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
     * รายละเอียดของสินค้าหนึ่งตัวสำหรับ sidebar ด้านขวาของหน้ารายการสินค้า
     * (tiktok-products.tsx) — mirror ของ LazadaAttributeMappingController::
     * productDetail() เป๊ะเกือบทั้งหมด ต่างกันตรงจุดที่ schema ของ TikTok เอง
     * ต่างจาก Lazada จริงๆ:
     *
     *  - ไม่มี skip-list ของ raw attribute name (เช่น 'price'/'qty'/
     *    'SellerSku' ที่ Lazada ต้องกรองออกจาก attribute list) เพราะ
     *    getAttributes() ของ TikTok คืนเฉพาะ category-specific custom
     *    attribute (PRODUCT_PROPERTY) เท่านั้น — ไม่เคยมีฟิลด์โครงสร้างตายตัว
     *    อย่าง price/qty/weight ปนมาในลิสต์นี้แบบที่ Lazada's
     *    /category/attributes/get คืนมาเลย
     *  - ไม่มีการ special-case 'brand' ใน attribute loop เหมือน Lazada
     *    เพราะ brand ของ TikTok ไม่ได้เป็นส่วนหนึ่งของ category attribute
     *    schema เลย (ดู TikTokProductSyncService::buildPayload()'s
     *    `'brand' => ['id' => ...]` — เป็นฟิลด์ตายตัวแยกต่างหาก resolve ผ่าน
     *    resolveTikTokBrandId() เท่านั้น) เลยย้ายไปโชว์ใน platform_fields
     *    tab แทน (ดู resolveBrandDisplayValue() ด้านล่าง) ไม่ใช่ attributes tab
     */
    public function productDetail(Product $product): JsonResponse
    {
        $product->load(['variants:id,parent_id']);

        $tiktokCategoryId = $product->tiktok_category_id
            ?: $product->categories()->whereNotNull('tiktok_category_id')->value('tiktok_category_id');

        $nameAttrId = Attribute::idForCode('pname');
        $activeLocaleId = Locale::idForCode(app()->getLocale());
        $pname = null;
        if ($nameAttrId) {
            $pname = ProductValue::where('product_id', $product->id)
                ->where('attribute_id', $nameAttrId)
                ->whereNull('channel_id')
                ->where(function ($q) use ($activeLocaleId) {
                    $q->where('locale_id', $activeLocaleId)->orWhereNull('locale_id');
                })
                ->orderByRaw('locale_id IS NULL') // ตัวที่ตรง locale ปัจจุบันมาก่อน ตัว global (locale_id null) เป็น fallback
                ->value('value');
        }

        $mappings = TikTokAttributeMapping::with('attribute')->get();

        $attributeRows = [];

        $nameMapping = $mappings->first(fn ($m) => $m->target_field === 'name' && $m->attribute);
        $resolvedName = $nameMapping ? $this->resolveAttributeDisplayValue($product, $nameMapping->attribute, $activeLocaleId) : $pname;
        $attributeRows[] = [
            'label' => 'ชื่อสินค้า',
            'mandatory' => true,
            'value' => $resolvedName,
        ];

        if ($tiktokCategoryId) {
            // "attribute ไหนอยู่ในหมวดหมู่นี้บ้าง + บังคับหรือเปล่า" มาจาก
            // tiktok_category_attributes เสมอตอนนี้ — ดู TikTokCategoryAttribute's
            // docblock (แก้บั๊ก attribute id เดียวกันในหลายหมวดหมู่ทับ category_id/
            // mandatory กันเองที่เคยเจอ) ไม่มี skip-list เหมือน Lazada — ดู
            // docblock ของ method นี้ด้านบน
            $mandatoryById = TikTokCategoryAttribute::where('category_id', $tiktokCategoryId)
                ->pluck('mandatory', 'tiktok_attribute_id');

            $tiktokAttrs = TikTokAttribute::whereIn('id', $mandatoryById->keys())
                ->orderBy('name')
                ->get();

            foreach ($tiktokAttrs as $ttAttr) {
                $mapping = $mappings->first(fn ($m) => $m->target_field === 'tiktok_attribute' && $m->tiktok_attribute_id === $ttAttr->id);
                $value = $mapping ? $this->resolveAttributeDisplayValue($product, $mapping->attribute, $activeLocaleId) : null;

                $attributeRows[] = [
                    'label' => $ttAttr->name,
                    'mandatory' => (bool) ($mandatoryById[$ttAttr->id] ?? false),
                    'value' => $value,
                ];
            }
        }

        $syncHistory = ProductMarketplaceSyncJob::where('product_id', $product->id)
            ->where('platform', 'tiktok')
            ->with('shop:id,name')
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn ($job) => [
                'action' => $job->action,
                'status' => $job->status,
                'message' => $job->message,
                'shop_name' => $job->shop->name ?? null,
                'created_at' => $job->created_at,
            ]);

        $publishedTikTokShops = $product->platformShops()
            ->whereHas('platform', fn ($q) => $q->where('code', 'tiktok'))
            ->get(['sales_platform_shops.id', 'sales_platform_shops.name', 'sales_platform_shops.channel_id']);

        // "ข้อมูลสินค้า (Platform)" tab — ต่างจาก $attributeRows ด้านบน (custom
        // category attribute เฉพาะหมวดหมู่นี้) ตรงที่กลุ่มนี้คือฟิลด์ตายตัวที่
        // TikTok ทุกหมวดหมู่ต้องมี (ราคา/สต็อก/น้ำหนัก-ขนาด/รายละเอียด/แบรนด์/
        // รูปภาพ/วิดีโอ) — ใช้ resolveMappedField()/resolveProductImageUrls()
        // จาก ResolvesProductAttributeValues trait ตัวเดียวกับที่
        // TikTokProductSyncService::buildPayload() ใช้จริงตอน push (ไม่เขียน
        // logic รีโซลฟ์ค่าซ้ำเอง) — ต่างจาก buildPayload() ตรงที่ตัวนี้ไม่เรียก
        // resolveProductAttributes() (ซึ่งยิง live API ไป TikTok เพื่อเช็ค
        // schema) เลย ไม่งั้นทุกครั้งที่เปิด tab นี้จะยิง API จริงโดยไม่จำเป็น
        // แค่ต้องการพรีวิวจากข้อมูลที่มีอยู่ในเครื่องเท่านั้น
        //
        // ใช้ channel ของร้านที่ published อยู่ตัวเดียว (ถ้ามีพอดี 1 ร้าน) เพื่อให้
        // ราคา/ค่าที่ผูกกับ channel ตรงกับร้านนั้นจริงๆ — ถ้าไม่มีหรือมีหลายร้าน
        // fallback เป็น channel เริ่มต้น (null = ค่า Default/All Channels)
        $channelId = $publishedTikTokShops->count() === 1 ? $publishedTikTokShops->first()->channel_id : null;

        $platformFields = [
            ['label' => 'Seller SKU', 'value' => $product->sku],
            // buildPayload() fallback ค่า description เป็น $name ตายตัวถ้าไม่มี
            // attribute แมปไว้ — mirror ลำดับเดียวกัน
            ['label' => 'รายละเอียดสินค้า (Description)', 'value' => $this->resolveMappedField($mappings, 'description', $product, $channelId, localeCode: 'th') ?: $resolvedName],
            ['label' => 'ราคา (Price)', 'value' => $this->resolveMappedField($mappings, 'price', $product, $channelId)],
            ['label' => 'จำนวนคงเหลือ (Qty)', 'value' => $this->resolveMappedField($mappings, 'qty', $product, $channelId)],
            ['label' => 'น้ำหนักบรรจุภัณฑ์ (kg)', 'value' => $this->resolveMappedField($mappings, 'weight', $product, $channelId)],
            ['label' => 'ความยาวบรรจุภัณฑ์ (cm)', 'value' => $this->resolveMappedField($mappings, 'length', $product, $channelId)],
            ['label' => 'ความกว้างบรรจุภัณฑ์ (cm)', 'value' => $this->resolveMappedField($mappings, 'width', $product, $channelId)],
            ['label' => 'ความสูงบรรจุภัณฑ์ (cm)', 'value' => $this->resolveMappedField($mappings, 'height', $product, $channelId)],
            // TikTok ต้องการ brand เสมอตอน push จริง (resolveTikTokBrandId()
            // throw ถ้าไม่มี) — ต่างจาก Lazada ตรงที่ไม่ได้มาจาก category
            // attribute schema เลย เป็นฟิลด์ตายตัวแยกต่างหาก (ดู docblock ของ
            // method นี้)
            ['label' => 'แบรนด์ (Brand)', 'value' => $this->resolveBrandDisplayValue($product)],
            // ไม่บังคับ (ไม่มีสินค้าไหนต้องมีวิดีโอ) — โชว์ไว้เผื่อ debug
            ['label' => 'วิดีโอสินค้า (Video)', 'value' => $this->resolveMappedField($mappings, 'video', $product, $channelId)],
        ];

        $platformImages = $this->resolveProductImageUrls($product, $channelId);

        return response()->json([
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => $pname ?: $product->sku,
            'variants_count' => $product->variants->count(),
            'enabled' => $product->enabled,
            'tiktok_category_path' => $this->tiktokCategoryPathFor($tiktokCategoryId),
            'attributes' => $attributeRows,
            'platform_fields' => $platformFields,
            'platform_images' => $platformImages,
            'sync_history' => $syncHistory,
            'published_tiktok_shops' => $publishedTikTokShops,
        ]);
    }

    /**
     * ค่า display ของ attribute หนึ่งตัวสำหรับสินค้าหนึ่งชิ้น ใช้โดย
     * productDetail() ด้านบนเท่านั้น — mirror ของ
     * LazadaAttributeMappingController::resolveAttributeDisplayValue() เป๊ะ
     * (ไม่ผูกกับ marketplace ไหนเป็นการเฉพาะอยู่แล้ว แค่ไม่มี shared trait
     * กลาง — Lazada เองก็ประกาศแยกไว้ในไฟล์ของตัวเองเช่นกัน)
     */
    private function resolveAttributeDisplayValue(Product $product, ?Attribute $attribute, ?int $activeLocaleId): ?string
    {
        if (! $attribute) {
            return null;
        }

        $localeId = $attribute->is_locale_based ? $activeLocaleId : null;
        $scopeToLocale = function ($query) use ($localeId) {
            return $query->where(function ($q) use ($localeId) {
                $q->where('locale_id', $localeId)->orWhereNull('locale_id');
            })->orderByRaw('locale_id IS NULL'); // ตรง locale ปัจจุบันก่อน ตัว global (locale_id null) เป็น fallback
        };

        $isVariantDefining = in_array($attribute->id, $product->configurable_attributes ?? [], true);

        if ($isVariantDefining && $product->variants->isNotEmpty()) {
            $codes = $product->variants->map(function ($variant) use ($attribute, $scopeToLocale) {
                return $scopeToLocale(
                    ProductValue::where('product_id', $variant->id)
                        ->where('attribute_id', $attribute->id)
                        ->whereNull('channel_id')
                )->value('value');
            });
        } else {
            $own = $scopeToLocale(
                ProductValue::where('product_id', $product->id)
                    ->where('attribute_id', $attribute->id)
                    ->whereNull('channel_id')
            )->value('value');
            $codes = collect($own !== null && $own !== '' ? [$own] : []);
        }

        $codes = $codes->filter(fn ($c) => $c !== null && $c !== '')->unique()->values();
        if ($codes->isEmpty()) {
            return null;
        }

        if (in_array($attribute->type, ['select', 'multiselect'], true)) {
            $labelByCode = AttributeOption::where('attribute_id', $attribute->id)
                ->whereIn('code', $codes)
                ->get()
                ->keyBy('code');

            return $codes->map(fn ($code) => $labelByCode->get($code)?->admin_label ?? $code)->implode(', ');
        }

        return $codes->implode(', ');
    }

    /**
     * ชื่อแบรนด์ที่จะส่งไป TikTok จริง — mirror ลำดับความสำคัญเดียวกับ
     * TikTokProductSyncService::resolveTikTokBrandId() เป๊ะๆ:
     *
     *   1. override เฉพาะสินค้า (products.tiktok_brand_id) ถ้ามี
     *   2. ไม่งั้นดูค่า attribute `pbrand` ของสินค้า → Brand.tiktok_brand_id
     *      ("Master Brand" — ตาราง tiktok_brands ที่ sync มาจาก TikTok จริง)
     *
     * ต่างจาก resolveBrandDisplayValue() ฝั่ง Lazada ตรงที่ไม่มีทาง fallback
     * ที่ 3 ผ่าน LazadaAttributeMapping ทั่วไป — TikTok ไม่เคย map brand
     * ผ่าน TikTokAttributeMapping เลย (ไม่ใช่ category attribute แบบ Lazada's
     * 'brand' — ดู docblock ของ productDetail() ด้านบน) resolveTikTokBrandId()
     * เองก็ throw ถ้าไม่มีทั้งสองทางนี้ ตรงนี้แค่คืน null แทน (เป็น preview
     * ไม่ใช่ path ที่ใช้ push จริง)
     */
    private function resolveBrandDisplayValue(Product $product): ?string
    {
        $tiktokBrandId = $product->tiktok_brand_id ?: $this->mappedBrandOptionId($product, 'tiktok_brand_id');
        if (! $tiktokBrandId) {
            return null;
        }

        return TikTokBrand::find($tiktokBrandId)?->name;
    }

    /**
     * เดินขึ้นสายพ่อแม่ของ TikTokCategory ทีละชั้นจนถึงราก — mirror ของ
     * LazadaAttributeMappingController::lazadaCategoryPathFor() เป๊ะ เรียก
     * ครั้งเดียวต่อ request นี้ (สินค้าเดียว) เลยไม่ต้อง preload ทั้งต้นไม้
     */
    private function tiktokCategoryPathFor(?int $categoryId): ?string
    {
        if (! $categoryId) {
            return null;
        }

        $names = [];
        $id = $categoryId;
        while ($id) {
            $cat = TikTokCategory::find($id, ['id', 'parent_id', 'name']);
            if (! $cat) {
                break;
            }
            array_unshift($names, $cat->name);
            $id = $cat->parent_id;
        }

        return $names ? implode(' > ', $names) : null;
    }

    /**
     * UI สำหรับการไล่ดูและจัดการ Mapping ข้อมูลของสินค้าใน TikTok — mirror ของ
     * ShopeeAttributeMappingController::shopeeProducts() เป๊ะ ใช้
     * ResolvesMarketplaceMasterCategory trait ตัวเดียวกัน (ไม่ต้อง duplicate
     * โค้ด resolveMasterCategory()/resolveMappedCategory() ซ้ำแบบตอน
     * Shopee/Lazada รอบแรกที่ยังไม่มี trait นี้)
     */
    public function tiktokProducts(Request $request): Response
    {
        $filter = $request->input('filter', 'all');
        if (! in_array($filter, ['all', 'mapped', 'unmapped'], true)) {
            $filter = 'all';
        }

        $search = trim((string) $request->input('search', ''));
        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $nameAttrId = Attribute::idForCode('pname');
        $activeLocaleId = Locale::idForCode(app()->getLocale());

        $allPimCategories = Category::query()->get(['id', 'parent_id', 'name', 'tiktok_category_id'])->keyBy('id');
        $pimCategoryPathOf = function (int $id) use ($allPimCategories): string {
            $names = [];
            $node = $allPimCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allPimCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $allTikTokCategories = TikTokCategory::query()->get(['id', 'parent_id', 'name', 'is_leaf'])->keyBy('id');
        $tiktokCategoryPathOf = function (int $id) use ($allTikTokCategories): string {
            $names = [];
            $node = $allTikTokCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allTikTokCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $query = Product::query()->whereNull('parent_id')->with(['categories', 'variants:id,parent_id']);

        if ($search !== '') {
            $query->where(function ($q) use ($search, $nameAttrId) {
                $q->where('sku', 'like', "%{$search}%");
                if ($nameAttrId) {
                    $q->orWhereHas('values', function ($vq) use ($nameAttrId, $search) {
                        $vq->where('attribute_id', $nameAttrId)
                            ->where('value', 'like', "%{$search}%");
                    });
                }
            });
        }

        if ($filter === 'mapped') {
            $query->where(function ($q) {
                $q->whereNotNull('tiktok_category_id')
                    ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.tiktok_category_id'));
            });
        } elseif ($filter === 'unmapped') {
            $query->whereNull('tiktok_category_id')
                ->whereDoesntHave('categories', fn ($cq) => $cq->whereNotNull('categories.tiktok_category_id'));
        }

        $paginated = $query->orderBy('id', 'desc')->paginate($perPage)->withQueryString();

        $pageProductIds = $paginated->getCollection()->pluck('id');

        $pnames = [];
        if ($nameAttrId && $pageProductIds->isNotEmpty()) {
            $values = ProductValue::whereIn('product_id', $pageProductIds)
                ->where('attribute_id', $nameAttrId)
                ->whereNull('channel_id')
                ->where(function ($q) use ($activeLocaleId) {
                    $q->whereNull('locale_id');
                    if ($activeLocaleId) {
                        $q->orWhere('locale_id', $activeLocaleId);
                    }
                })
                ->get();
            foreach ($values as $v) {
                if (! isset($pnames[$v->product_id]) || $v->locale_id === $activeLocaleId) {
                    $pnames[$v->product_id] = $v->value;
                }
            }
        }

        $mappedAttrIds = TikTokAttributeMapping::whereNotNull('tiktok_attribute_id')->pluck('tiktok_attribute_id')->unique()->all();
        $tiktokCategoryStats = [];

        // "N/M attr แมปแล้ว" ต่อหมวดหมู่ — มาจาก tiktok_category_attributes
        // เสมอตอนนี้ (ไม่ใช่ tiktok_attributes.category_id ที่ deprecated แล้ว
        // ดู TikTokCategoryAttribute's docblock) แต่ละหมวดหมู่มีชุด attribute
        // เป็นของตัวเองจริงๆ ไม่ทับกันข้ามหมวดหมู่อีกต่อไป
        $catAttrGroup = TikTokCategoryAttribute::get(['category_id', 'tiktok_attribute_id'])->groupBy('category_id');
        foreach ($catAttrGroup as $ttCatId => $attrs) {
            $totalAttr = $attrs->count();
            $mappedCount = $attrs->filter(fn ($a) => in_array($a->tiktok_attribute_id, $mappedAttrIds, true))->count();
            $tiktokCategoryStats[$ttCatId] = [
                'total' => $totalAttr,
                'mapped' => $mappedCount,
            ];
        }

        // สถานะ "sync ไป TikTok แล้วหรือยัง" ต่อสินค้า — คนละเรื่องกับ
        // category_mapped/attribute_stats ด้านบน (นั่นคือ "ตั้งค่า mapping ไว้
        // ครบหรือยัง" ส่วนนี้คือ "เคย push แล้วยืนยันว่า live จริงบน TikTok
        // หรือยัง") mirror ของ LazadaAttributeMappingController::
        // lazadaProducts()'s $lazadaShopSyncByProduct เป๊ะ
        $tiktokShopSyncByProduct = DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->where('sales_platforms.code', 'tiktok')
            ->where('product_platform_shops.status', 'live')
            ->whereIn('product_platform_shops.product_id', $pageProductIds)
            ->orderBy('sales_platform_shops.name')
            ->get([
                'product_platform_shops.product_id',
                'sales_platform_shops.name as shop_name',
                'product_platform_shops.last_synced_at',
            ])
            ->groupBy('product_id');

        $rows = $paginated->getCollection()->map(function (Product $product) use ($pnames, $pimCategoryPathOf, $allTikTokCategories, $tiktokCategoryPathOf, $tiktokCategoryStats, $allPimCategories, $tiktokShopSyncByProduct) {
            $masterCat = $this->resolveMasterCategory($product, $allPimCategories, 'tiktok_category_id');

            // เหตุผลเดียวกับ ShopeeAttributeMappingController — $masterCat คือ
            // หมวดหมู่ที่ลึกที่สุดสำหรับแสดงผล ตัวที่ผูก tiktok_category_id
            // ไว้จริงอาจเป็นหมวดแม่ของมันแทนก็ได้ ต้องไล่หาในทุกหมวดหมู่ของ
            // สินค้า ไม่ใช่แค่ $masterCat ตัวเดียว
            $mappedCategory = $this->resolveMappedCategory($product, $allPimCategories, 'tiktok_category_id') ?? $masterCat;

            $tiktokCatId = $product->tiktok_category_id ?? ($mappedCategory?->tiktok_category_id);
            $tiktokCat = $tiktokCatId ? $allTikTokCategories->get($tiktokCatId) : null;

            $attrStats = $tiktokCatId ? ($tiktokCategoryStats[$tiktokCatId] ?? ['total' => 0, 'mapped' => 0]) : null;

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $pnames[$product->id] ?? $product->sku,
                'variants_count' => $product->variants->count(),
                'master_category' => $masterCat ? [
                    'id' => $masterCat->id,
                    'name' => $masterCat->name,
                    'path' => $pimCategoryPathOf($masterCat->id),
                    'tiktok_category_id' => $masterCat->tiktok_category_id,
                ] : null,
                'tiktok_category' => $tiktokCat ? [
                    'id' => $tiktokCat->id,
                    'name' => $tiktokCat->name,
                    'path' => $tiktokCategoryPathOf($tiktokCat->id),
                ] : null,
                'category_mapped' => (bool) $tiktokCatId,
                'attribute_stats' => $attrStats,
                'tiktok_sync' => [
                    'synced' => $tiktokShopSyncByProduct->has($product->id),
                    'shops' => $tiktokShopSyncByProduct->get($product->id, collect())
                        ->map(fn ($row) => ['name' => $row->shop_name, 'last_synced_at' => $row->last_synced_at])
                        ->values()->all(),
                ],
            ];
        });

        $paginated->setCollection($rows);

        $totalProductsCount = Product::query()->whereNull('parent_id')->count();
        $mappedProductsCount = Product::query()->whereNull('parent_id')->where(function ($q) {
            $q->whereNotNull('tiktok_category_id')
                ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.tiktok_category_id'));
        })->count();

        return Inertia::render('catalog/marketplace/tiktok-products', [
            'products' => $paginated,
            'stats' => [
                'total' => $totalProductsCount,
                'mapped' => $mappedProductsCount,
                'unmapped' => $totalProductsCount - $mappedProductsCount,
            ],
            'filters' => [
                'search' => $search,
                'filter' => $filter,
                'per_page' => $perPage,
            ],
        ]);
    }

    /**
     * จับคู่ PIM AttributeOption แต่ละตัว เข้ากับตัวเลือกที่ TikTok กำหนดไว้
     * ล่วงหน้า (tiktok_attributes.options) — mirror ของ
     * ShopeeAttributeMappingController::updateOptionMappings() เป๊ะ
     */
    public function updateOptionMappings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.tiktok_attribute_mapping_id' => ['required', 'integer', 'exists:tiktok_attribute_mappings,id'],
            'mappings.*.attribute_option_id' => ['required', 'integer', 'exists:attribute_options,id'],
            'mappings.*.tiktok_option_value' => ['nullable', 'string'],
            'mappings.*.tiktok_option_label' => ['nullable', 'string'],
        ]);

        foreach ($validated['mappings'] as $entry) {
            $key = [
                'tiktok_attribute_mapping_id' => $entry['tiktok_attribute_mapping_id'],
                'attribute_option_id' => $entry['attribute_option_id'],
            ];

            if (empty($entry['tiktok_option_value'])) {
                TikTokAttributeOptionMapping::where($key)->get()->each->delete();
                continue;
            }

            $mapping = TikTokAttributeOptionMapping::firstOrNew($key);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->tiktok_option_value = $entry['tiktok_option_value'];
            $mapping->tiktok_option_label = $entry['tiktok_option_label'] ?? null;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        return response()->json(['success' => true]);
    }

    /**
     * "สร้าง/อัปเดต Attribute Family" ที่ section 2 ของ tiktok-products.tsx —
     * mirror ของ ShopeeAttributeMappingController::syncAttributeFamily() เป๊ะ
     */
    public function syncAttributeFamily(
        Request $request,
        TikTokMappedAttributeCreator $attributeCreator,
        TikTokAttributeFamilyGenerator $familyGenerator,
    ): JsonResponse {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::whereNotNull('tiktok_category_id')->find($validated['category_id']);
        if (!$category) {
            return response()->json(['message' => 'This category is not mapped to a TikTok category yet.'], 422);
        }

        try {
            $newlyCreatedCount = $attributeCreator->createMissingForCategory((int) $category->tiktok_category_id);
            $result = $familyGenerator->syncForCategory($category);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'family' => ['id' => $result['family']->id, 'name' => $result['family']->name],
            'attribute_count' => $result['attribute_count'],
            'newly_created_count' => $newlyCreatedCount,
            'edit_url' => "/catalog/attributeFamilies/{$result['family']->id}/edit",
        ]);
    }

    /**
     * แท็บ "History" ของหน้า tiktok-products.tsx — mirror ของ
     * ShopeeAttributeMappingController::timeline() เป๊ะ
     */
    public function timeline(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::findOrFail($validated['category_id']);
        $logs = app(TikTokMappingTimelineBuilder::class)->build($category);

        return response()->json([
            'timeline' => $logs->map(function ($log) {
                $old = $log->old_values ?? [];
                $new = $log->new_values ?? [];
                $keys = array_unique(array_merge(array_keys($old), array_keys($new)));

                $diff = collect($keys)->map(fn ($key) => [
                    'key' => $key,
                    'old' => $old[$key] ?? null,
                    'new' => $new[$key] ?? null,
                ])->values();

                return [
                    'event' => $log->event,
                    'subject_type' => $log->auditable_type ? class_basename($log->auditable_type) : null,
                    'subject_id' => $log->auditable_id,
                    'created_at' => $log->created_at?->toIso8601String(),
                    'actor' => $log->user ? ($log->user->name ?: $log->user->email) : 'System',
                    'diff' => $diff,
                ];
            })->values(),
        ]);
    }

    /**
     * PIM attribute ที่แมปไว้กับแต่ละฟิลด์ payload ตายตัวของ TikTok (name/price/
     * qty/weight/length/width/height/description/video) ให้ section
     * "3. Payload TikTok" ของหน้า tiktok-products.tsx ใช้ prefill ตอนเปิดหน้า
     * — mirror ของ ShopeeAttributeMappingController::payloadFieldMappings()
     */
    public function payloadFieldMappings(): JsonResponse
    {
        $mappingsByField = TikTokAttributeMapping::whereIn('target_field', self::STRUCTURED_TARGET_FIELDS)
            ->with('attribute:id,name')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('target_field');

        $data = collect(self::STRUCTURED_TARGET_FIELDS)->map(function ($field) use ($mappingsByField) {
            $first = $mappingsByField->get($field)?->first();

            return [
                'target_field' => $field,
                'mapped' => $first && $first->attribute ? ['id' => $first->attribute->id, 'name' => $first->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
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
        // (category_id, tiktok_attribute_id) => is_mandatory — เก็บแยกจาก
        // $rowsById ด้านบน (ซึ่งจงใจ dedupe ข้าม category เพราะ name/
        // is_customizable/is_multiple_selection/options เสถียรพอจะ key ด้วย
        // `id` เฉยๆ ได้จริง) เพราะ mandatory ต่างจากนั้น — เปลี่ยนไปตาม
        // category จริง เก็บรวมแถวเดียวแบบ $rowsById ไม่ได้ ไม่งั้นจะเจอบั๊ก
        // เดิมที่ tiktok_attributes.category_id/.mandatory เคยเป็น (ดู
        // TikTokCategoryAttribute's docblock)
        $categoryAttrRows = [];

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
                    'options' => $this->encodeTikTokOptions($attr),
                ];

                // 'is_requried' — TikTok's own typo, not ours (see
                // TikTokClient::getAttributes()'s docblock).
                $categoryAttrRows[] = [
                    'category_id' => (int) $categoryId,
                    'tiktok_attribute_id' => $attr['id'],
                    'mandatory' => (bool) ($attr['is_requried'] ?? false),
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
                ['name', 'is_customizable', 'is_multiple_selection', 'options', 'updated_at']
            );
        }

        foreach (array_chunk($categoryAttrRows, 500) as $chunk) {
            TikTokCategoryAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['category_id', 'tiktok_attribute_id'],
                ['mandatory', 'updated_at']
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
                'options' => $this->encodeTikTokOptions($attr),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        // แยกเขียนคนละตาราง: name/is_customizable/is_multiple_selection/
        // options ยังคงไป tiktok_attributes เหมือนเดิม (เสถียรพอจะ dedupe ข้าม
        // category ได้จริง) ส่วน mandatory ซึ่งเปลี่ยนไปตาม category ไปที่
        // tiktok_category_attributes แทน — ไม่ใช้แถวเดียวกันซ้อนกันแบบเดิมอีก
        // ต่อไป (บั๊กที่แก้ไปแล้ว ดู TikTokCategoryAttribute's docblock)
        if ($rows !== []) {
            TikTokAttribute::upsert($rows, ['id'], ['name', 'is_customizable', 'is_multiple_selection', 'options', 'updated_at']);

            $categoryAttrRows = array_map(fn (array $attr) => [
                'category_id' => $categoryId,
                'tiktok_attribute_id' => $attr['id'],
                'mandatory' => (bool) ($attr['is_requried'] ?? false),
                'created_at' => $now,
                'updated_at' => $now,
            ], array_values(array_filter($schema, fn ($attr) => ($attr['type'] ?? null) === 'PRODUCT_PROPERTY')));
            TikTokCategoryAttribute::upsert($categoryAttrRows, ['category_id', 'tiktok_attribute_id'], ['mandatory', 'updated_at']);
        }

        TikTokAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * `options` (ตัวเลือกที่ TikTok กำหนดไว้ล่วงหน้าสำหรับ attribute ที่
     * `is_customizable=false`) จาก raw schema ที่
     * syncTikTokAttributes()/syncTikTokAttributesForCategory() อ่านมาจาก
     * TikTok จริง — shape ยืนยันแล้วจากของจริงตั้งแต่ก่อนงานนี้ (ดู
     * TikTokClient::getAttributes()'s docblock, live 2026-08-17): `values[]`
     * เป็น `[{id, name}]`
     */
    private function encodeTikTokOptions(array $attr): ?string
    {
        $options = $attr['values'] ?? [];
        if (!is_array($options) || $options === []) {
            return null;
        }

        return json_encode(array_values($options));
    }

    /**
     * TikTok attribute ที่แคชไว้สำหรับหมวดหมู่หนึ่งๆ (ดูหมายเหตุใน migration ที่บอกว่า
     * คอลัมน์นี้ "ใช้บอกข้อมูลเฉยๆ ไม่ใช่ FK จริง" — ที่ list ออกมาก็คือสิ่งที่ sync ล่าสุด
     * ของหมวดหมู่นั้นเจอจริงๆ) แต่ละตัวจะแนบมาด้วยว่า PIM attribute ไหนแมปอยู่ (ถ้ามี)
     * เป็นข้อมูลหนุนหลังตารางคอลัมน์ "จับคู่ Attribute กับ PIM" บนหน้า
     * categories/tiktok-mapping.tsx — ทำงานเหมือนกับ
     * ShopeeAttributeMappingController::shopeeAttributesForCategory() เป๊ะๆ
     * แค่ใช้ `id` เป็น key (เป็น string ตามชนิด PK ของ TikTokAttribute เอง)
     *
     * เพิ่ม `options`/`tiktok_attribute_mapping_id`/`option_mappings` เข้ามา
     * (mirror ของ ShopeeAttributeMappingController::shopeeAttributesForCategory())
     * ให้หน้า tiktok-products.tsx เปิด dialog "จับคู่ตัวเลือก" ได้
     *
     * "attribute ไหนอยู่ในหมวดหมู่นี้บ้าง + บังคับหรือเปล่า" มาจาก
     * tiktok_category_attributes เสมอตอนนี้ (ไม่ใช่ tiktok_attributes.
     * category_id/.mandatory ที่ deprecated แล้ว — ดู TikTokCategoryAttribute
     * กับ TikTokAttribute's docblock) ส่วน name/is_customizable/
     * is_multiple_selection/options ยังมาจาก tiktok_attributes เหมือนเดิม
     * (ข้อมูลที่เสถียรพอจะ key ด้วย `id` เฉยๆ ได้จริง)
     */
    public function tiktokAttributesForCategory(int $tiktokCategoryId): JsonResponse
    {
        $mandatoryById = TikTokCategoryAttribute::where('category_id', $tiktokCategoryId)
            ->pluck('mandatory', 'tiktok_attribute_id');

        $attributes = TikTokAttribute::whereIn('id', $mandatoryById->keys())->orderBy('name')->get();

        $mappedByTikTokAttributeId = TikTokAttributeMapping::whereIn('tiktok_attribute_id', $attributes->pluck('id'))
            ->with(['attribute:id,name', 'optionMappings'])
            ->get()
            ->keyBy('tiktok_attribute_id');

        $data = $attributes->map(function (TikTokAttribute $attribute) use ($mappedByTikTokAttributeId, $mandatoryById) {
            $mapping = $mappedByTikTokAttributeId->get($attribute->id);
            $isSelectType = !$attribute->is_customizable;

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'is_customizable' => (bool) $attribute->is_customizable,
                'is_multiple_selection' => (bool) $attribute->is_multiple_selection,
                'mandatory' => (bool) ($mandatoryById[$attribute->id] ?? false),
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
                // `options` cast เป็น array แล้ว (ดู TikTokAttribute::$casts)
                'options' => $isSelectType
                    ? collect($attribute->options ?? [])
                        ->filter(fn ($o) => is_array($o) && isset($o['id']))
                        ->map(fn ($o) => ['value' => (string) $o['id'], 'label' => (string) ($o['name'] ?? $o['id'])])
                        ->values()
                    : [],
                'tiktok_attribute_mapping_id' => $mapping?->id,
                'option_mappings' => $mapping
                    ? $mapping->optionMappings->map(fn (TikTokAttributeOptionMapping $m) => [
                        'attribute_option_id' => $m->attribute_option_id,
                        'tiktok_option_value' => $m->tiktok_option_value,
                    ])->values()
                    : [],
            ];
        });

        return response()->json(['data' => $data->values()]);
    }
}
