<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeTranslation;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokAttributeOptionMapping;
use App\Models\TikTokCategoryAttribute;
use Illuminate\Support\Facades\DB;

/**
 * Mirror ของ ShopeeMappedAttributeCreator เป๊ะ — ดูตัวนั้นๆ docblock สำหรับ
 * เหตุผลเต็มๆ ต่างกันแค่จุดที่ TikTok's schema ต่างจาก Shopee จริงๆ:
 *  - `TikTokAttribute` คีย์ด้วย `id` string (TikTok's own attribute id) ไม่ใช่
 *    ตัวเลข — reuse logic เดิมเป๊ะ แค่ join ด้วย string id
 *  - ไม่มีคอลัมน์ input_type เลย — ใช้ `is_customizable`/`is_multiple_selection`
 *    (boolean คู่) แยกประเภทแทน: customizable → text, ไม่ customizable +
 *    multiple → multiselect, ไม่ customizable + ไม่ multiple → select
 */
class TikTokMappedAttributeCreator
{
    private const SELECT_TYPES = ['select', 'multiselect'];

    /**
     * @return int จำนวน TikTokAttributeMapping ที่สร้างใหม่ — เหมือน
     *             ShopeeMappedAttributeCreator::createMissingForCategory()
     */
    public function createMissingForCategory(int $tiktokCategoryId): int
    {
        $alreadyMappedIds = TikTokAttributeMapping::where('target_field', 'tiktok_attribute')
            ->whereHas('attribute')
            ->pluck('tiktok_attribute_id');

        // "attribute ไหนอยู่ในหมวดหมู่นี้บ้าง" มาจาก tiktok_category_attributes
        // เสมอตอนนี้ (ไม่ใช่ tiktok_attributes.category_id ที่ deprecated แล้ว
        // — ดู TikTokCategoryAttribute's docblock)
        $tiktokAttributeIds = TikTokCategoryAttribute::where('category_id', $tiktokCategoryId)->pluck('tiktok_attribute_id');

        $unmapped = TikTokAttribute::whereIn('id', $tiktokAttributeIds)
            ->whereNotIn('id', $alreadyMappedIds)
            ->get();

        if ($unmapped->isEmpty()) {
            return 0;
        }

        return DB::transaction(function () use ($unmapped) {
            $created = 0;
            foreach ($unmapped as $tiktokAttribute) {
                if ($this->createAndMapOne($tiktokAttribute)) {
                    $created++;
                }
            }

            Attribute::bumpCodeMapVersion();
            TikTokAttributeMapping::bumpListVersion();

            return $created;
        });
    }

    /**
     * @return bool จริงก็ต่อเมื่อ mapping ใหม่ถูกสร้างจริง (ใช้ตัดสิน
     *              $created ใน createMissingForCategory() ด้านบน) — บั๊กจริง
     *              ที่เจอจาก code review: เดิม caller นับ $created++ ทุกครั้ง
     *              ไม่ว่า method นี้จะ early-return เพราะ code ชนกับ
     *              attribute ที่ถูกแมปเข้า target_field อื่นไปแล้วหรือไม่ —
     *              ทำให้ตัวเลข "สร้างใหม่ N attribute" ที่โชว์ในหน้า UI
     *              (syncAttributeFamily()'s newly_created_count) นับเกินจริง
     *              แถมยังไม่มีการแจ้งเตือนใดๆ เลยว่า attribute ตัวนี้ไม่มีวัน
     *              แมปได้จริง (จะถูก "ลองใหม่" เงียบๆ แบบนี้ทุกครั้งที่ sync)
     */
    private function createAndMapOne(TikTokAttribute $tiktokAttribute): bool
    {
        $pimType = $this->resolvePimType($tiktokAttribute);
        $attribute = $this->findOrCreateAttribute($tiktokAttribute, $pimType);

        $mapping = TikTokAttributeMapping::firstOrNew(['attribute_id' => $attribute->id]);
        // ไม่ทับ mapping เดิมถ้า attribute นี้บังเอิญถูก reuse (code ชนกัน) และ
        // มี target_field อื่นอยู่ก่อนแล้ว (เช่นแมปไว้เป็น 'name'/'price' ผ่านหน้า
        // Payload TikTok) — ปล่อยของเดิมไว้ ไม่เขียนทับความตั้งใจเดิมของแอดมิน
        if ($mapping->exists) {
            return false;
        }
        $mapping->target_field = 'tiktok_attribute';
        $mapping->tiktok_attribute_id = $tiktokAttribute->id;
        $mapping->sort_order = 0;
        $mapping->save();

        if (in_array($pimType, self::SELECT_TYPES, true)) {
            $this->createOptionsAndMappings($tiktokAttribute, $attribute, $mapping);
        }

        return true;
    }

    /**
     * customizable = free text เสมอ (ไม่ว่า is_multiple_selection จะเป็นอะไร
     * — PIM ไม่มี type "multi free-text" ยอมรับข้อจำกัดนี้ตรงๆ เหมือนที่
     * ShopeeMappedAttributeCreator ยอมรับว่า free-text ทุกตัวเป็น PIM type
     * text เสมอไม่แยก number/date); ไม่ customizable → ต้องเลือกจาก
     * `options` เสมอ แยก select/multiselect ตาม is_multiple_selection
     */
    private function resolvePimType(TikTokAttribute $tiktokAttribute): string
    {
        if ($tiktokAttribute->is_customizable) {
            return 'text';
        }

        return $tiktokAttribute->is_multiple_selection ? 'multiselect' : 'select';
    }

    /**
     * เหมือน ShopeeMappedAttributeCreator::findOrCreateAttribute() เป๊ะ ทั้ง
     * เช็ค type ก่อน reuse และไม่ reuse attribute ที่ถูกลบไปแล้ว (soft-deleted)
     */
    private function findOrCreateAttribute(TikTokAttribute $tiktokAttribute, string $pimType): Attribute
    {
        $code = $this->sanitizeCode($tiktokAttribute->name);

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
            'name' => $tiktokAttribute->name,
            'type' => $pimType,
            'is_required' => false,
            'is_unique' => false,
            'is_locale_based' => false,
            'is_channel_based' => false,
            'is_filterable' => false,
        ]);

        $this->setDefaultLocaleLabel(AttributeTranslation::class, 'attribute_id', $attribute->id, $tiktokAttribute->name);

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
            // ชื่อต้นทางไม่เหลือตัวอักษร a-z เลยหลัง sanitize (พบจริง: TikTok
            // attribute ชื่อภาษาไทยล้วน เช่น "สไตล์"/"การติดตั้ง"/"วัสดุ") —
            // บั๊กจริงที่เจอจากการทดสอบกับ category จริง: เดิม fallback เป็น
            // ค่าคงที่ 'tt_' เฉยๆ ทำให้ attribute ต้นทางคนละตัวที่ชื่อไทยล้วน
            // ทุกตัว sanitize ไปเป็นโค้ดเดียวกันหมด แล้วถูก reuse ทับกันเป็น
            // "attribute เดียวกัน" ผิดๆ ทั้งที่เป็นคนละตัวจริง (ยืนยันจาก
            // category จริง 4 ใน 5 attribute ชื่อไทยหายไปเงียบๆ เพราะโดน
            // attribute แรกที่ประมวลผลก่อนแย่ง mapping ไปหมด) — ผูก fallback
            // เข้ากับ hash ของชื่อต้นทางแทนค่าคงที่ ให้แต่ละชื่อที่ต่างกันได้
            // โค้ดที่ต่างกัน (deterministic ด้วย — sync ซ้ำได้โค้ดเดิมเสมอ)
            $code = 'tt_'.substr(md5($rawName), 0, 10);
        }

        return mb_substr($code, 0, 100);
    }

    /**
     * `tiktok_attributes.options` เป็น `[{id, name}]` (ยืนยันจากของจริงตั้งแต่
     * ก่อนงานนี้ — ดู TikTokAttribute's docblock) — สร้าง AttributeOption
     * หนึ่งแถวต่อหนึ่งตัวเลือก โดยใช้ TikTok's `id` เองเป็น `code`
     */
    private function createOptionsAndMappings(TikTokAttribute $tiktokAttribute, Attribute $attribute, TikTokAttributeMapping $mapping): void
    {
        $options = $tiktokAttribute->options ?? [];
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

                AuditLog::record('option_created', $attribute, null, $this->optionAuditFields($attributeOption));
            }

            TikTokAttributeOptionMapping::updateOrCreate(
                ['tiktok_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $attributeOption->id],
                ['tiktok_option_value' => $optionCode, 'tiktok_option_label' => $optionLabel]
            );

            $sortOrder++;
        }
    }

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
