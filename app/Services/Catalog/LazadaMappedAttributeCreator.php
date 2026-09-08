<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeTranslation;
use App\Models\AuditLog;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use App\Models\Locale;
use Illuminate\Support\Facades\DB;

/**
 * "สร้าง/อัปเดต Attribute Family" ที่ section 2 ของ lazada-products.tsx (Object
 * Page ต่อสินค้า) เดิมเอาแค่ PIM attribute ที่เคยแมปไว้แล้วมาจัดกลุ่ม (ดู
 * LazadaAttributeFamilyGenerator) — ตัวนี้เติมช่องว่างที่เหลือ: auto-create PIM
 * Attribute ใหม่ (+ AttributeOption/LazadaAttributeOptionMapping สำหรับ
 * select-type) ให้ Lazada attribute ของ category ที่ **ยังไม่มีใครแมปเลย** แล้ว
 * สร้าง LazadaAttributeMapping ให้ทันที — จะได้ไม่ต้องให้แอดมินไปสร้าง Attribute
 * เองทีละตัวที่หน้า Attribute ก่อนค่อยมาแมป
 *
 * แยกเป็น service คนละไฟล์กับ LazadaAttributeFamilyGenerator โดยตั้งใจ — ตัวนั้น
 * แค่จัดกลุ่มของที่มีอยู่แล้ว (ย้อนกลับได้ง่าย ลบ FamilyAttribute ทิ้งก็จบ) ส่วน
 * ตัวนี้สร้าง schema จริง (Attribute/AttributeOption) ถาวรกว่า เสี่ยงกว่า ควรแยก
 * ให้ review/ตรวจสอบง่าย
 *
 * ยังไม่มี precedent ของการ auto-generate PIM Attribute จาก marketplace schema
 * มาก่อนในระบบนี้ (ทุก marketplace ให้แอดมินสร้าง Attribute เองแล้วมาแมปเท่านั้น)
 * — เขียนด้วย default ที่ปลอดภัยที่สุดเท่าที่ทำได้ (ดู docblock ของแต่ละ method)
 */
class LazadaMappedAttributeCreator
{
    // Lazada input_type => PIM Attribute type — ตรงกับ MAPPABLE_INPUT_TYPES ของ
    // LazadaAttributeMappingController (ทุกตัวที่หน้า Attribute Mapping รับแมปได้
    // ตอนนี้) วนสร้างเฉพาะกลุ่มนี้ ข้าม input_type อื่นที่ยังไม่รองรับไปเงียบๆ
    private const TYPE_MAP = [
        'text' => 'text',
        'numeric' => 'number',
        'richText' => 'textarea',
        'date' => 'date',
        'img' => 'image',
        'singleSelect' => 'select',
        'enumInput' => 'select',
        'multiSelect' => 'multiselect',
        'multiEnumInput' => 'multiselect',
    ];

    private const SELECT_TYPES = ['select', 'multiselect'];

    /**
     * @return int จำนวน LazadaAttributeMapping ที่สร้างใหม่ (ทั้ง reuse
     *             attribute เดิมและสร้าง Attribute ใหม่ นับรวมกันหมด — ฝั่งเรียกใช้
     *             สนใจแค่ "มีอะไรถูกแมปเพิ่มไหม" ไม่ต้องแยกว่าสร้างใหม่จริงกี่ตัว)
     */
    public function createMissingForCategory(int $lazadaCategoryId): int
    {
        $alreadyMappedNames = LazadaAttributeMapping::where('target_field', 'lazada_attribute')
            ->whereHas('attribute')
            ->pluck('lazada_attribute_name');

        $unmapped = LazadaAttribute::where('category_id', $lazadaCategoryId)
            ->whereNotIn('name', $alreadyMappedNames)
            ->whereIn('input_type', array_keys(self::TYPE_MAP))
            ->get();

        if ($unmapped->isEmpty()) {
            return 0;
        }

        return DB::transaction(function () use ($unmapped) {
            $created = 0;
            foreach ($unmapped as $lazadaAttribute) {
                $this->createAndMapOne($lazadaAttribute);
                $created++;
            }

            Attribute::bumpCodeMapVersion();
            LazadaAttributeMapping::bumpListVersion();

            return $created;
        });
    }

    private function createAndMapOne(LazadaAttribute $lazadaAttribute): void
    {
        $pimType = self::TYPE_MAP[$lazadaAttribute->input_type];
        $attribute = $this->findOrCreateAttribute($lazadaAttribute, $pimType);

        $mapping = LazadaAttributeMapping::firstOrNew(['attribute_id' => $attribute->id]);
        // ไม่ทับ mapping เดิมถ้า attribute นี้บังเอิญถูก reuse (code ชนกัน) และ
        // มี target_field อื่นอยู่ก่อนแล้ว (เช่นแมปไว้เป็น 'name'/'price' ผ่านหน้า
        // Payload Lazada) — ปล่อยของเดิมไว้ ไม่เขียนทับความตั้งใจเดิมของแอดมิน
        if ($mapping->exists) {
            return;
        }
        $mapping->target_field = 'lazada_attribute';
        $mapping->lazada_attribute_name = $lazadaAttribute->name;
        $mapping->sort_order = 0;
        $mapping->save();

        if (in_array($pimType, self::SELECT_TYPES, true)) {
            $this->createOptionsAndMappings($lazadaAttribute, $attribute, $mapping);
        }
    }

    /**
     * ถ้า code ที่ sanitize จากชื่อ Lazada attribute ชนกับ Attribute ที่**ยังใช้
     * งานอยู่จริง (ไม่ trashed) และ type ตรงกันด้วย** — สมมติว่า code ตรงกันเป๊ะ =
     * ความหมายเดียวกันจริง แล้ว reuse attribute เดิมตรงๆ แทนที่จะสร้างซ้ำ (ยอมรับ
     * ความเสี่ยงนี้ไว้ตรงๆ — ยังไม่เคยเจอ false-positive จริงในระบบนี้ ณ ตอนเขียน)
     *
     * **ต้องเช็ค type ด้วย** (บั๊กจริงที่เจอจาก code review: เดิม reuse แค่เพราะ
     * code ตรงกัน ไม่สนใจ type เลย) — ถ้า code ชนกับ attribute ที่ type ไม่ตรงกับ
     * ที่ Lazada input_type ต้องการ (เช่น Lazada attribute ชื่อ "Color" แบบ
     * singleSelect ดันชนกับ PIM attribute "color" ที่มีอยู่แล้วเป็น type text)
     * ไม่ใช่ attribute เดียวกันจริง — reuse ไปจะทำให้ createOptionsAndMappings()
     * ด้านล่างสร้าง AttributeOption ผูกกับ attribute ที่ไม่ใช่ select/multiselect
     * ซึ่งไม่มีวันแสดงในหน้าไหนหรือ resolve ค่าได้ตอน push เลย — ต้องหา code
     * สำรองแล้วสร้างเป็น attribute ใหม่แยกต่างหากแทน เหมือนกับกรณี trashed
     * ด้านล่าง
     *
     * ถ้า code นั้นถูกใช้แล้วแต่โดย attribute ที่ถูกลบไปแล้ว (soft-deleted) — **ไม่
     * reuse** เหมือนกัน (บั๊กจริงอีกอันที่เจอตอนทดสอบ: attribute ที่ลบไปแล้วไม่โผล่
     * ในหน้าไหนเลย ทั้ง Product Edit และ picker ต่างๆ กรอง trashed ออกหมด แปลว่า
     * สร้าง mapping ไปหามันแล้ว field นั้นจะ "หายไป" เงียบๆ ทั้งที่ mapping
     * สร้างสำเร็จ — แถมยังอาจพก option/translation เก่าที่ไม่ตรงกับความหมายตอนนี้
     * ติดมาด้วย) — หา code สำรองแทน (`_2`, `_3`, ...) แล้วสร้างเป็น attribute ใหม่
     * จริงๆ — ไม่ revive ของเก่าคืนมาแบบเงียบๆ ให้คนตัดสินใจเองถ้าจะกู้จริงๆ
     *
     * ใช้ withTrashed() ตอนหา "โค้ดสำรอง" เท่านั้น (ต้องเลี่ยง unique constraint
     * ระดับ DB ที่ไม่ผ่อนตาม soft-delete) ไม่ใช่ตอนตัดสินใจ reuse
     */
    private function findOrCreateAttribute(LazadaAttribute $lazadaAttribute, string $pimType): Attribute
    {
        $code = $this->sanitizeCode($lazadaAttribute->name);

        $existingActive = Attribute::where('code', $code)->first();
        if ($existingActive) {
            if ($existingActive->type === $pimType) {
                return $existingActive;
            }
            // code ตรงกันแต่ type ไม่ตรง — ไม่ใช่ attribute เดียวกันจริง หาโค้ดสำรอง
            $code = $this->disambiguateCode($code);
        } elseif (Attribute::withTrashed()->where('code', $code)->exists()) {
            $code = $this->disambiguateCode($code);
        }

        $attribute = Attribute::create([
            'code' => $code,
            'name' => $lazadaAttribute->label,
            'type' => $pimType,
            'is_required' => false,
            'is_unique' => false,
            'is_locale_based' => false,
            'is_channel_based' => false,
            'is_filterable' => false,
        ]);

        $this->setDefaultLocaleLabel(AttributeTranslation::class, 'attribute_id', $attribute->id, $lazadaAttribute->label);

        return $attribute;
    }

    private function disambiguateCode(string $baseCode): string
    {
        $suffix = 2;
        do {
            $candidate = mb_substr($baseCode, 0, 96).'_'.$suffix;
            $suffix++;
        } while (Attribute::withTrashed()->where('code', $candidate)->exists());

        return $candidate;
    }

    private function sanitizeCode(string $rawName): string
    {
        $code = strtolower($rawName);
        $code = preg_replace('/[^a-z0-9_]+/', '_', $code) ?? '';
        $code = trim($code, '_');
        $code = preg_replace('/_+/', '_', $code) ?? '';

        if ($code === '' || !preg_match('/^[a-z]/', $code)) {
            $code = 'lz_'.$code;
        }

        return mb_substr($code, 0, 100);
    }

    /**
     * `lazada_attributes.options` เป็น `[{name, en_name, id}]` (ยืนยันจากข้อมูล
     * จริงที่ sync ไว้แล้ว — ดู docblock ของ LazadaAttribute) — สร้าง
     * AttributeOption หนึ่งแถวต่อหนึ่งตัวเลือก โดยใช้ Lazada's `id` เองเป็น
     * `code` (unique พออยู่แล้วเพราะ scope ต่อ attribute_id) แล้วสร้าง
     * LazadaAttributeOptionMapping คู่กันทันที เพราะรู้ 1:1 correspondence
     * อยู่แล้วตั้งแต่ตอนสร้าง — ไม่ต้องให้แอดมินไปกด "จับคู่ตัวเลือก" เองซ้ำอีกที
     */
    private function createOptionsAndMappings(LazadaAttribute $lazadaAttribute, Attribute $attribute, LazadaAttributeMapping $mapping): void
    {
        $options = $lazadaAttribute->options ?? [];
        if (!is_array($options)) {
            return;
        }

        $sortOrder = 0;
        foreach ($options as $option) {
            if (!is_array($option) || !isset($option['id'])) {
                continue;
            }

            $optionCode = (string) $option['id'];
            $optionLabel = (string) ($option['name'] ?? $optionCode);

            $attributeOption = AttributeOption::firstOrNew(['attribute_id' => $attribute->id, 'code' => $optionCode]);
            if (!$attributeOption->exists) {
                $attributeOption->admin_label = $optionLabel;
                $attributeOption->sort_order = $sortOrder;
                $attributeOption->save();

                // AttributeOption ไม่ใช้ Auditable (ดู AttributeOptionController
                // ที่ต้อง log เองทุกจุดเหมือนกัน) — mirror รูปแบบ event/key
                // เดียวกับ AttributeOptionController::store()'s
                // 'option_created' log เป๊ะ (log ไว้ที่ $attribute เจ้าของ ไม่ใช่
                // ที่ตัว option) เพื่อให้ประวัติของ option ที่สร้างผ่านปุ่มนี้กับ
                // ที่สร้างผ่านหน้า Attribute Option ปกติ อ่านต่อเนื่องกันได้
                AuditLog::record('option_created', $attribute, null, $this->optionAuditFields($attributeOption));
            }

            LazadaAttributeOptionMapping::updateOrCreate(
                ['lazada_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $attributeOption->id],
                ['lazada_option_value' => $optionCode, 'lazada_option_label' => $optionLabel]
            );

            $sortOrder++;
        }
    }

    /**
     * เหมือน AttributeOptionController::optionAuditFields() เป๊ะ — คีย์รูปแบบ
     * "option#{id}.{field}" เดียวกัน เจตนาให้ log ที่มาจากสองที่นี้อ่านรวมกัน
     * เป็นประวัติเดียวกันได้
     */
    private function optionAuditFields(AttributeOption $option): array
    {
        $prefix = "option#{$option->id}";

        return collect($option->only(['code', 'admin_label', 'swatch_value', 'sort_order']))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
    }

    /**
     * @param class-string<AttributeTranslation> $translationClass
     */
    private function setDefaultLocaleLabel(string $translationClass, string $foreignKey, int $ownerId, string $label): void
    {
        $defaultLocaleId = Locale::where('code', config('app.locale'))->value('id')
            ?? Locale::where('enabled', true)->orderBy('id')->value('id');

        if (!$defaultLocaleId) {
            return;
        }

        $translationClass::updateOrCreate(
            [$foreignKey => $ownerId, 'locale_id' => $defaultLocaleId],
            ['label' => $label]
        );
    }
}
