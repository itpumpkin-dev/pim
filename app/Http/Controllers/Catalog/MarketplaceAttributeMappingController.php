<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\WooCommerceAttribute;
use App\Models\WooCommerceAttributeMapping;
use App\Services\ImportExport\SpreadsheetWriter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * จุดเข้าเดียว ("จับคู่เนื้อหา Marketplace") ที่รวมข้อมูล attribute-mapping ของ
 * ทั้ง 4 แพลตฟอร์มไว้ใน Inertia response เดียว แสดงผลเป็นแท็บผ่าน
 * resources/js/pages/catalog/attributes/marketplace-mapping.tsx
 * — แทนที่หน้า hub tile/page/controller ที่แยกกัน 4 อันเดิม ซึ่งต่างก็มี
 * index() action ของตัวเอง (WooCommerceAttributeMappingController,
 * ShopeeAttributeMappingController, LazadaAttributeMappingController,
 * TikTokAttributeMappingController — แต่ละตัวยังคง update()/syncXAttributes()
 * ที่เป็น action เขียนข้อมูลไว้เหมือนเดิม เรียกใช้จากในแผงแท็บของตัวเอง
 * มีแค่ index() ที่เป็น read-only ของทั้ง 4 ตัวเท่านั้นที่ถูกรวมมาไว้ที่นี่)
 */
class MarketplaceAttributeMappingController extends Controller
{
    // target_field ตายตัวทั้งหมดที่ sync service ของแต่ละแพลตฟอร์มอ่านผ่าน
    // resolveMappedField()/buildContentFields() — เหมือนกับ
    // *AttributeMappingController::TARGET_FIELDS ของแต่ละตัว แค่ตัดกลุ่ม
    // custom attribute ออก ('wc_attribute'/'shopee_attribute'/'lazada_attribute'/
    // 'tiktok_attribute') เพราะกลุ่มนั้นมี platformAttributeCoverage() ด้านล่าง
    // คอยเช็คแยกต่างหากอยู่แล้ว ใช้ตัวนี้ไว้รายงานว่าฟิลด์ payload ไหนบ้างที่
    // ยังไม่มี attribute ของ PIM ตัวไหนป้อนเข้าไปเลย
    private const PAYLOAD_FIELDS = [
        'woocommerce' => ['description', 'short_description', 'name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height', 'video'],
        'shopee' => ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'],
        'lazada' => ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'video'],
        'tiktok' => ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'],
    ];

    // schema ของ category-attribute ตัวจริงบน Lazada (lazada_attributes) อาจมี
    // entry ที่ชื่อตรงกับพวกนี้เป๊ะๆ — ซึ่งจริงๆ แล้วถูกครอบคลุมด้วยฟิลด์ payload
    // ตายตัวด้านบนอยู่แล้ว (ดูฟิลด์ SellerSku/quantity/price/name/video/package_*
    // ใน LazadaProductSyncService::buildPayload()) ถ้านับซ้ำเป็น "Lazada attribute
    // ที่ยังไม่ได้ map" อีก จะกลายเป็นนับช่องว่างที่จริงๆ ไม่มีอยู่จริง แถมยังเติมผ่าน
    // กลุ่ม lazada_attribute ไม่ได้อยู่ดี
    private const LAZADA_RESERVED_ATTRIBUTE_NAMES = [
        'SellerSku', 'name', 'price', 'quantity', 'video',
        'package_weight', 'package_length', 'package_width', 'package_height',
    ];

    public function index(): Response
    {
        $pimAttributes = Attribute::cachedList();

        $wooMappings = WooCommerceAttributeMapping::cachedList();
        $shopeeMappings = ShopeeAttributeMapping::cachedList();
        $lazadaMappings = LazadaAttributeMapping::cachedList();
        $tiktokMappings = TikTokAttributeMapping::cachedList();

        $wooCommerceAttributes = WooCommerceAttribute::cachedList();
        $shopeeAttributes = ShopeeAttribute::cachedList();
        $lazadaAttributes = LazadaAttribute::cachedList();
        $tiktokAttributes = TikTokAttribute::cachedList();

        return Inertia::render('catalog/attributes/marketplace-mapping', [
            'woocommerce' => [
                'attributes' => $this->woocommerceAttributeRows($pimAttributes, $wooMappings),
                'wooCommerceAttributes' => $wooCommerceAttributes,
                'coverage' => [
                    'payloadFields' => $this->payloadFieldCoverage($wooMappings, self::PAYLOAD_FIELDS['woocommerce']),
                    // wc_attribute ไม่มีการจำกัด input_type (ดูที่
                    // WooCommerceAttributeMappingController) — WooCommerce
                    // attribute ที่ sync มาแล้วทุกตัวใช้เป็นเป้าหมาย mapping ได้หมด
                    'platformAttributes' => $this->platformAttributeCoverage(
                        $wooCommerceAttributes,
                        $wooMappings->where('target_field', 'wc_attribute')->pluck('woocommerce_attribute_id')->all(),
                    ),
                ],
            ],
            'shopee' => [
                'attributes' => $this->shopeeAttributeRows($pimAttributes, $shopeeMappings),
                'shopeeAttributes' => $shopeeAttributes,
                'coverage' => [
                    'payloadFields' => $this->payloadFieldCoverage($shopeeMappings, self::PAYLOAD_FIELDS['shopee']),
                    'platformAttributes' => $this->platformAttributeCoverage(
                        $shopeeAttributes->where('input_type', 3), // FREE_TEXT_FILED — ชนิดเดียวที่ map ได้
                        $shopeeMappings->where('target_field', 'shopee_attribute')->pluck('shopee_attribute_id')->all(),
                    ),
                ],
            ],
            'lazada' => [
                'attributes' => $this->lazadaAttributeRows($pimAttributes, $lazadaMappings),
                'lazadaAttributes' => $lazadaAttributes,
                'coverage' => [
                    'payloadFields' => $this->payloadFieldCoverage($lazadaMappings, self::PAYLOAD_FIELDS['lazada']),
                    'platformAttributes' => $this->platformAttributeCoverage(
                        $lazadaAttributes
                            ->whereIn('input_type', ['text', 'numeric', 'richText'])
                            ->reject(fn ($a) => in_array($a->name, self::LAZADA_RESERVED_ATTRIBUTE_NAMES, true)),
                        $lazadaMappings->where('target_field', 'lazada_attribute')->pluck('lazada_attribute_name')->all(),
                        idKey: 'name',
                        labelKey: 'label',
                    ),
                ],
            ],
            'tiktok' => [
                'attributes' => $this->tiktokAttributeRows($pimAttributes, $tiktokMappings),
                'tiktokAttributes' => $tiktokAttributes,
                'coverage' => [
                    'payloadFields' => $this->payloadFieldCoverage($tiktokMappings, self::PAYLOAD_FIELDS['tiktok']),
                    'platformAttributes' => $this->platformAttributeCoverage(
                        $tiktokAttributes->where('is_customizable', true),
                        $tiktokMappings->where('target_field', 'tiktok_attribute')->pluck('tiktok_attribute_id')->all(),
                    ),
                ],
            ],
        ]);
    }

    // ค่า target_field ของกลุ่ม custom-attribute ในแต่ละแพลตฟอร์ม (ดูคอมเมนต์ของ
    // self::PAYLOAD_FIELDS ด้านบน) — นี่คือค่าที่ `target_field` ของแถวจะเป็น
    // เมื่อถูก map เข้ากับ attribute เฉพาะตัวของแพลตฟอร์มนั้น (หาด้วย id/name key
    // ด้านล่าง) แทนที่จะเป็นหนึ่งในฟิลด์ payload ตายตัว
    private const CUSTOM_TARGET_FIELD = [
        'woocommerce' => 'wc_attribute',
        'shopee' => 'shopee_attribute',
        'lazada' => 'lazada_attribute',
        'tiktok' => 'tiktok_attribute',
    ];

    /**
     * ส่งออกแท็บ attribute-mapping ของแพลตฟอร์มหนึ่งเป็น CSV/XLS/XLSX — ใช้
     * แถวข้อมูลชุดเดียวกับที่ index() ป้อนให้แท็บนั้น (เพราะงั้นจะสะท้อน mapping
     * ล่าสุดที่ *เซฟแล้ว* เท่านั้น ไม่ใช่การแก้ไขที่ยังไม่เซฟในแท็บ ซึ่งมีอยู่แค่ฝั่ง
     * client เท่านั้น) และยังเคารพ filter search/status ที่แท็บนั้นเลือกอยู่ตอนนี้
     * (ต้องส่งมาตรงๆ เพราะ filter นี้เป็น state ฝั่ง client ล้วนๆ ไม่เคยถูกส่งกลับ
     * ไปที่ server ด้วยวิธีอื่น)
     */
    public function export(Request $request): BinaryFileResponse
    {
        $validated = $request->validate([
            'platform' => ['required', 'in:woocommerce,shopee,lazada,tiktok'],
            'format' => ['required', 'in:csv,xls,xlsx'],
            'search' => ['nullable', 'string'],
            'status' => ['nullable', 'in:all,mapped,unmapped'],
            'locale' => ['nullable', 'string', Rule::exists('locales', 'code')->where('enabled', true)],
        ]);

        // บังคับตั้งค่าตรงๆ แทนที่จะปล่อยให้ดึงจาก session/cookie เอง — ดูคอมเมนต์
        // แบบเดียวกันที่ AttributeController::export() ว่าทำไมปล่อยแบบนั้นแล้ว
        // อาจได้ค่าที่ไม่ตรงกับที่แท็บกำลังแสดงอยู่แบบเงียบๆ
        if (! empty($validated['locale'])) {
            app()->setLocale($validated['locale']);
        }

        $platform = $validated['platform'];
        $format = $validated['format'];
        $status = $validated['status'] ?? 'all';
        $needle = isset($validated['search']) ? mb_strtolower(trim($validated['search'])) : '';

        $pimAttributes = Attribute::cachedList();

        [$rows, $customIdField, $lookup, $lookupIdKey, $lookupLabelKey] = match ($platform) {
            'woocommerce' => [
                $this->woocommerceAttributeRows($pimAttributes, WooCommerceAttributeMapping::cachedList()),
                'woocommerce_attribute_id',
                WooCommerceAttribute::cachedList(),
                'id', 'name',
            ],
            'shopee' => [
                $this->shopeeAttributeRows($pimAttributes, ShopeeAttributeMapping::cachedList()),
                'shopee_attribute_id',
                ShopeeAttribute::cachedList(),
                'id', 'name',
            ],
            'lazada' => [
                $this->lazadaAttributeRows($pimAttributes, LazadaAttributeMapping::cachedList()),
                'lazada_attribute_name',
                LazadaAttribute::cachedList(),
                'name', 'label',
            ],
            'tiktok' => [
                $this->tiktokAttributeRows($pimAttributes, TikTokAttributeMapping::cachedList()),
                'tiktok_attribute_id',
                TikTokAttribute::cachedList(),
                'id', 'name',
            ],
        };

        $customTargetField = self::CUSTOM_TARGET_FIELD[$platform];
        $lookupByKey = $lookup->keyBy($lookupIdKey);

        $exportRows = [];
        foreach ($rows as $row) {
            $isMapped = ! empty($row['target_field']);

            if ($status === 'mapped' && ! $isMapped) {
                continue;
            }
            if ($status === 'unmapped' && $isMapped) {
                continue;
            }
            if ($needle !== ''
                && ! str_contains(mb_strtolower($row['code']), $needle)
                && ! str_contains(mb_strtolower($row['label']), $needle)) {
                continue;
            }

            $mappedTo = '';
            if ($isMapped) {
                if ($row['target_field'] === $customTargetField) {
                    $customValue = $row[$customIdField] ?? null;
                    $match = $customValue !== null ? $lookupByKey->get($customValue) : null;
                    $mappedTo = $match ? ($match->{$lookupLabelKey} ?? (string) $customValue) : (string) $customValue;
                } else {
                    $mappedTo = $row['target_field'];
                }
            }

            $exportRows[] = [
                'code' => $row['code'],
                'label' => $row['label'],
                'type' => $row['type'],
                'status' => $isMapped ? 'mapped' : 'unmapped',
                'mapped_to' => $mappedTo,
                'sort_order' => $row['sort_order'],
            ];
        }

        Storage::disk('local')->makeDirectory('tmp-exports');
        $tempRelativePath = 'tmp-exports/'.Str::uuid().'.'.$format;
        $tempAbsolutePath = Storage::disk('local')->path($tempRelativePath);

        $columns = ['code', 'label', 'type', 'status', 'mapped_to', 'sort_order'];
        SpreadsheetWriter::write($tempAbsolutePath, $format, $columns, $exportRows, ',');

        $downloadName = $platform.'_attribute_mapping_'.now()->format('Ymd_His').'.'.$format;

        return response()->download($tempAbsolutePath, $downloadName)->deleteFileAfterSend(true);
    }

    /**
     * เช็คว่าฟิลด์ payload ตายตัวของแพลตฟอร์ม (self::PAYLOAD_FIELDS) ตัวไหนบ้าง
     * ที่ยังไม่มี attribute ของ PIM ถูก map เข้าไปเลยสักตัว — เช่น short_description
     * ของ WooCommerce ถ้าไม่มีอะไรป้อนเข้าไป ตอน push จะได้ HTML ที่ประกอบขึ้นมา
     * เป็นค่าว่างเปล่า `missing` คือลิสต์ของ target_field key ดิบๆ ส่วนฝั่ง
     * frontend จะแปลแต่ละตัวเป็น label เองผ่าน FIELD_LABEL_KEYS ของมัน
     */
    private function payloadFieldCoverage(\Illuminate\Support\Collection $mappings, array $fields): array
    {
        $mappedFields = $mappings->pluck('target_field')->unique()->all();
        $missing = array_values(array_diff($fields, $mappedFields));

        return [
            'total' => count($fields),
            'mapped' => count($fields) - count($missing),
            'missing' => $missing,
        ];
    }

    /**
     * เช็คว่า attribute ดั้งเดิมของ marketplace เอง (ตัวที่แอดมิน map attribute
     * ของ PIM เข้าไปได้ผ่านกลุ่ม custom-attribute — กรองมาแล้วว่าเป็นตัวที่ map
     * ได้จริงเท่านั้น เช่น free-text/customizable) ตัวไหนบ้างที่ยังไม่มี attribute
     * ของ PIM ป้อนเข้าไปเลยสักตัว
     */
    private function platformAttributeCoverage(\Illuminate\Support\Collection $allMappable, array $mappedIdentifiers, string $idKey = 'id', string $labelKey = 'name'): array
    {
        $missing = $allMappable
            ->reject(fn ($a) => in_array($a->{$idKey}, $mappedIdentifiers, true))
            ->map(fn ($a) => $a->{$labelKey} ?? $a->{$idKey})
            ->values();

        return [
            'total' => $allMappable->count(),
            'mapped' => $allMappable->count() - $missing->count(),
            'missing' => $missing,
        ];
    }

    private function woocommerceAttributeRows($pimAttributes, \Illuminate\Support\Collection $mappings)
    {
        $mappingsByAttributeId = $mappings->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'target_field' => $mapping->target_field ?? null,
                'woocommerce_attribute_id' => $mapping->woocommerce_attribute_id ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }

    private function shopeeAttributeRows($pimAttributes, \Illuminate\Support\Collection $mappings)
    {
        $mappingsByAttributeId = $mappings->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'target_field' => $mapping->target_field ?? null,
                'shopee_attribute_id' => $mapping->shopee_attribute_id ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }

    private function lazadaAttributeRows($pimAttributes, \Illuminate\Support\Collection $mappings)
    {
        $mappingsByAttributeId = $mappings->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'target_field' => $mapping->target_field ?? null,
                'lazada_attribute_name' => $mapping->lazada_attribute_name ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }

    private function tiktokAttributeRows($pimAttributes, \Illuminate\Support\Collection $mappings)
    {
        $mappingsByAttributeId = $mappings->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'target_field' => $mapping->target_field ?? null,
                'tiktok_attribute_id' => $mapping->tiktok_attribute_id ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }
}
