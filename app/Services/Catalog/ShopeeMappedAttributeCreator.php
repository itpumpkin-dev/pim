<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeTranslation;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use Illuminate\Support\Facades\DB;

/**
 * Mirror ของ LazadaMappedAttributeCreator เป๊ะ — ดูตัวนั้นๆ docblock สำหรับ
 * เหตุผลเต็มๆ (ทำไมแยกไฟล์จาก ShopeeAttributeFamilyGenerator, ทำไม default
 * ระมัดระวังแบบ allowlist) ต่างกันแค่จุดที่ Shopee's schema ต่างจาก Lazada
 * จริงๆ:
 *  - `ShopeeAttribute` คีย์ด้วย `id` ตัวเลข ไม่ใช่ `name` string — reuse
 *    logic เดิมเป๊ะ แค่ join ด้วย id
 *  - Shopee's input_type เป็นแค่ enum ตัวเลข 1-5 ไม่มีรายละเอียดแบบ Lazada
 *    (text/numeric/richText/date/img แยกกัน) — free-text (input_type=3)
 *    ทุกตัวเลยกลายเป็น PIM type `text` เสมอ ไม่มีทางแยก "อันไหนควรเป็น
 *    number/date" ได้จาก schema เอง (ต่างจาก Lazada ที่ input_type บอกชัด)
 *    ยอมรับข้อจำกัดนี้ไว้ตรงๆ — แอดมินแก้ type เองทีหลังได้ถ้าจำเป็นจากหน้า
 *    Attribute ปกติ
 */
class ShopeeMappedAttributeCreator
{
    // Shopee input_type => PIM Attribute type — 1=SINGLE_DROP_DOWN,
    // 2=SINGLE_COMBO_BOX, 3=FREE_TEXT_FILED, 4=MULTI_DROP_DOWN,
    // 5=MULTI_COMBO_BOX (ดู shopee_attributes migration's docblock)
    private const TYPE_MAP = [
        1 => 'select',
        2 => 'select',
        3 => 'text',
        4 => 'multiselect',
        5 => 'multiselect',
    ];

    private const SELECT_TYPES = ['select', 'multiselect'];

    /**
     * @return int จำนวน ShopeeAttributeMapping ที่สร้างใหม่ — เหมือน
     *             LazadaMappedAttributeCreator::createMissingForCategory()
     */
    public function createMissingForCategory(int $shopeeCategoryId): int
    {
        $alreadyMappedIds = ShopeeAttributeMapping::where('target_field', 'shopee_attribute')
            ->whereHas('attribute')
            ->pluck('shopee_attribute_id');

        $unmapped = ShopeeAttribute::where('category_id', $shopeeCategoryId)
            ->whereNotIn('id', $alreadyMappedIds)
            ->whereIn('input_type', array_keys(self::TYPE_MAP))
            ->get();

        if ($unmapped->isEmpty()) {
            return 0;
        }

        return DB::transaction(function () use ($unmapped) {
            $created = 0;
            foreach ($unmapped as $shopeeAttribute) {
                if ($this->createAndMapOne($shopeeAttribute)) {
                    $created++;
                }
            }

            Attribute::bumpCodeMapVersion();
            ShopeeAttributeMapping::bumpListVersion();

            return $created;
        });
    }

    /**
     * @return bool จริงก็ต่อเมื่อ mapping ใหม่ถูกสร้างจริง (ใช้ตัดสิน
     *              $created ใน createMissingForCategory() ด้านบน) — บั๊กจริง
     *              ที่เจอจาก code review: เดิม caller นับ $created++ ทุกครั้ง
     *              ไม่ว่า method นี้จะ early-return เพราะ code ชนกับ
     *              attribute ที่ถูกแมปเข้า target_field อื่นไปแล้วหรือไม่ —
     *              ทำให้ตัวเลข "สร้างใหม่ N attribute" ที่โชว์ในหน้า UI นับ
     *              เกินจริง แถมไม่มีการแจ้งเตือนเลยว่า attribute ตัวนี้ไม่มี
     *              วันแมปได้จริง (ถูก "ลองใหม่" เงียบๆ ทุกครั้งที่ sync)
     */
    private function createAndMapOne(ShopeeAttribute $shopeeAttribute): bool
    {
        $pimType = self::TYPE_MAP[$shopeeAttribute->input_type];
        $attribute = $this->findOrCreateAttribute($shopeeAttribute, $pimType);

        $mapping = ShopeeAttributeMapping::firstOrNew(['attribute_id' => $attribute->id]);
        // ไม่ทับ mapping เดิมถ้า attribute นี้บังเอิญถูก reuse (code ชนกัน) และ
        // มี target_field อื่นอยู่ก่อนแล้ว (เช่นแมปไว้เป็น 'name'/'price' ผ่านหน้า
        // Payload Shopee) — ปล่อยของเดิมไว้ ไม่เขียนทับความตั้งใจเดิมของแอดมิน
        if ($mapping->exists) {
            return false;
        }
        $mapping->target_field = 'shopee_attribute';
        $mapping->shopee_attribute_id = $shopeeAttribute->id;
        $mapping->sort_order = 0;
        $mapping->save();

        if (in_array($pimType, self::SELECT_TYPES, true)) {
            $this->createOptionsAndMappings($shopeeAttribute, $attribute, $mapping);
        }

        return true;
    }

    /**
     * เหมือน LazadaMappedAttributeCreator::findOrCreateAttribute() เป๊ะ ทั้ง
     * เช็ค type ก่อน reuse (บั๊กที่เคยแก้ไปแล้วฝั่ง Lazada — ทำถูกตั้งแต่ต้นที่
     * นี่เลย) และไม่ reuse attribute ที่ถูกลบไปแล้ว (soft-deleted)
     */
    private function findOrCreateAttribute(ShopeeAttribute $shopeeAttribute, string $pimType): Attribute
    {
        $code = $this->sanitizeCode($shopeeAttribute->name);

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
            'name' => $shopeeAttribute->name,
            'type' => $pimType,
            'is_required' => false,
            'is_unique' => false,
            'is_locale_based' => false,
            'is_channel_based' => false,
            'is_filterable' => false,
        ]);

        $this->setDefaultLocaleLabel(AttributeTranslation::class, 'attribute_id', $attribute->id, $shopeeAttribute->name);

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
            // บั๊กจริงที่เจอจากการทดสอบ TikTokMappedAttributeCreator กับ
            // category จริงที่มี attribute ชื่อภาษาไทยล้วน — เดิม fallback
            // เป็นค่าคงที่ 'sp_' เฉยๆ ทำให้ attribute ต้นทางคนละตัวที่ชื่อ
            // ไม่เหลือ a-z เลย (เช่นชื่อไทยล้วน) sanitize ไปเป็นโค้ดเดียวกัน
            // หมด แล้วถูก reuse ทับกันเป็น "attribute เดียวกัน" ผิดๆ — ผูก
            // fallback เข้ากับ hash ของชื่อต้นทางแทนค่าคงที่ (เหมือนที่แก้ให้
            // TikTokMappedAttributeCreator แล้ว) ให้แต่ละชื่อที่ต่างกันได้
            // โค้ดที่ต่างกัน — ยืนยันแล้วว่า Shopee ยังไม่เคยเจอ attribute
            // ชื่อไม่ใช่ภาษาอังกฤษจริง (ไม่มีข้อมูลเก่าที่ต้องแก้ไข) แต่แก้ไว้
            // กันเผื่ออนาคต
            $code = 'sp_'.substr(md5($rawName), 0, 10);
        }

        return mb_substr($code, 0, 100);
    }

    /**
     * `shopee_attributes.options` shape ยืนยันแล้วจากข้อมูลจริง (sandbox,
     * 2026-09-08 — ดู ShopeeAttribute's docblock): `{value_id, name,
     * multi_lang}` — ยังเขียนแบบ defensive ไว้ (ข้ามตัวเลือกที่ไม่มี
     * value_id/id แทนที่จะ throw) เผื่อ category อื่นให้ shape ต่างออกไป
     * เล็กน้อย
     */
    private function createOptionsAndMappings(ShopeeAttribute $shopeeAttribute, Attribute $attribute, ShopeeAttributeMapping $mapping): void
    {
        $options = $shopeeAttribute->options ?? [];
        if (!is_array($options)) {
            return;
        }

        $sortOrder = 0;
        foreach ($options as $option) {
            if (!is_array($option)) {
                continue;
            }

            $rawValueId = $option['value_id'] ?? $option['id'] ?? null;
            if ($rawValueId === null) {
                continue;
            }

            $optionCode = (string) $rawValueId;
            $optionLabel = (string) ($option['original_value_name'] ?? $option['name'] ?? $optionCode);

            $attributeOption = AttributeOption::firstOrNew(['attribute_id' => $attribute->id, 'code' => $optionCode]);
            if (!$attributeOption->exists) {
                $attributeOption->admin_label = $optionLabel;
                $attributeOption->sort_order = $sortOrder;
                $attributeOption->save();

                AuditLog::record('option_created', $attribute, null, $this->optionAuditFields($attributeOption));
            }

            ShopeeAttributeOptionMapping::updateOrCreate(
                ['shopee_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $attributeOption->id],
                ['shopee_option_value' => $optionCode, 'shopee_option_label' => $optionLabel]
            );

            $sortOrder++;
        }
    }

    /**
     * เหมือน LazadaMappedAttributeCreator::optionAuditFields() เป๊ะ
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
