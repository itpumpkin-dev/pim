<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeTranslation;
use App\Models\Locale;
use App\Models\WooCommerceAttribute;
use App\Models\WooCommerceAttributeMapping;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * "สร้าง/อัปเดต Attribute Family" ที่ Section 2 ของ woocommerce-products.tsx
 * เดิมเอาแค่ PIM attribute ที่เคยแมปไว้แล้วมาจัดกลุ่ม (ดู
 * WooCommerceAttributeFamilyGenerator) — ตัวนี้เติมช่องว่างที่เหลือ mirror
 * ของ LazadaMappedAttributeCreator แต่**เรียบง่ายกว่ามาก** เพราะ WooCommerce
 * attribute เป็น global ทั้งหมด (ไม่ผูก category เลย — ดู
 * WooCommerceAttributeFamilyGenerator's docblock) และไม่มีตัวเลือกที่กำหนด
 * ไว้ล่วงหน้าให้ sync มาเก็บเหมือน lazada_attributes.options (ตาราง
 * woocommerce_attributes เก็บแค่ id/name/slug/type — ไม่มี terms/choices
 * ของ attribute นั้นเลย เพราะ WooCommerceProductSyncService::
 * buildWooCommerceAttributes() ส่งค่าที่ resolve ได้เป็น plain string ตรงๆ
 * ผ่าน `options: [value]` เสมอ ไม่แยก select-type ออกมาต่างหากแบบ Lazada) —
 * เลย auto-create เป็น PIM attribute type `text` เสมอ ไม่มีแตกกรณีตาม
 * input_type แบบ LazadaMappedAttributeCreator::TYPE_MAP และไม่มี
 * createOptionsAndMappings() ให้เรียกเลย
 */
class WooCommerceMappedAttributeCreator
{
    private const PIM_TYPE = 'text';

    /**
     * @return int จำนวน WooCommerceAttributeMapping ที่สร้างใหม่ (ทั้ง reuse
     *             attribute เดิมและสร้าง Attribute ใหม่ นับรวมกันหมด — ดู
     *             LazadaMappedAttributeCreator::createMissingForCategory()'s
     *             docblock สำหรับเหตุผลเดียวกัน)
     */
    public function createMissingAttributes(): int
    {
        $alreadyMappedIds = WooCommerceAttributeMapping::where('target_field', 'wc_attribute')
            ->whereHas('attribute')
            ->pluck('woocommerce_attribute_id');

        $unmapped = WooCommerceAttribute::whereNotIn('id', $alreadyMappedIds)->get();

        if ($unmapped->isEmpty()) {
            return 0;
        }

        return DB::transaction(function () use ($unmapped) {
            $created = 0;
            foreach ($unmapped as $wooAttribute) {
                if ($this->createAndMapOne($wooAttribute)) {
                    $created++;
                }
            }

            Attribute::bumpCodeMapVersion();
            WooCommerceAttributeMapping::bumpListVersion();

            return $created;
        });
    }

    /**
     * @return bool จริงก็ต่อเมื่อ mapping ใหม่ถูกสร้างจริง — เหตุผลเดียวกับ
     *              LazadaMappedAttributeCreator::createAndMapOne()'s docblock
     */
    private function createAndMapOne(WooCommerceAttribute $wooAttribute): bool
    {
        $attribute = $this->findOrCreateAttribute($wooAttribute);

        $mapping = WooCommerceAttributeMapping::firstOrNew(['attribute_id' => $attribute->id]);
        // ไม่ทับ mapping เดิมถ้า attribute นี้บังเอิญถูก reuse (code ชนกัน) และ
        // มี target_field อื่นอยู่ก่อนแล้ว (เช่นแมปไว้เป็น 'name'/'price' ผ่าน
        // หน้า Payload WooCommerce) — ปล่อยของเดิมไว้ ไม่เขียนทับความตั้งใจเดิม
        // ของแอดมิน
        if ($mapping->exists) {
            return false;
        }
        $mapping->target_field = 'wc_attribute';
        $mapping->woocommerce_attribute_id = $wooAttribute->id;
        $mapping->sort_order = 0;

        return $this->trySaveMapping($mapping);
    }

    /**
     * Mirror ของ LazadaMappedAttributeCreator::trySaveMapping() เป๊ะ — ดู
     * ตัวนั้นๆ docblock สำหรับเหตุผลเต็มๆ
     */
    private function trySaveMapping(WooCommerceAttributeMapping $mapping): bool
    {
        try {
            DB::transaction(fn () => $mapping->save());

            return true;
        } catch (UniqueConstraintViolationException) {
            return false;
        }
    }

    /**
     * เหตุผลเดียวกับ LazadaMappedAttributeCreator::findOrCreateAttribute()'s
     * docblock เต็มๆ (reuse เฉพาะ code+type ตรงกันทั้งคู่, ไม่ revive attribute
     * ที่ soft-deleted) — ต่างกันแค่ type ตรวจสอบเป็นค่าคงที่ `text` เสมอ ไม่มี
     * TYPE_MAP ให้ผันตาม input_type แบบ Lazada
     */
    private function findOrCreateAttribute(WooCommerceAttribute $wooAttribute): Attribute
    {
        $code = $this->sanitizeCode($wooAttribute->name);

        $existingActive = Attribute::where('code', $code)->first();
        if ($existingActive) {
            if ($existingActive->type === self::PIM_TYPE) {
                return $existingActive;
            }
            $code = $this->disambiguateCode($code);
        } elseif (Attribute::withTrashed()->where('code', $code)->exists()) {
            $code = $this->disambiguateCode($code);
        }

        return $this->createAttributeAt($code, $wooAttribute->name);
    }

    /**
     * Mirror ของ LazadaMappedAttributeCreator::createAttributeAt() เป๊ะ —
     * ดูตัวนั้นๆ docblock สำหรับเหตุผลเต็มๆ (retry ภายใต้ disambiguated code
     * ใหม่เมื่อ request คู่แข่งชนะ insert เดียวกันไปก่อน — race จริง ไม่ใช่
     * สมมติฐาน เพราะ createMissingAttributes() อ่าน $unmapped list ครั้งเดียว
     * แล้ววนซ้ำโดยไม่มี per-row lock ใดๆ) ต่างกันแค่ type ตรวจสอบเป็นค่าคงที่
     * `text` เสมอ ไม่ต้องรับ $pimType เป็นพารามิเตอร์แบบ 3 platform อื่น
     */
    private function createAttributeAt(string $code, string $label, int $attemptsLeft = 5): Attribute
    {
        try {
            $attribute = DB::transaction(fn () => Attribute::create([
                'code' => $code,
                'name' => $label,
                'type' => self::PIM_TYPE,
                // ให้ PimAttributePicker โชว์ chip บอกที่มา — set เฉพาะตอนสร้างใหม่
                // จริงๆ ตรงนี้เท่านั้น (ไม่แตะตอน reuse attribute เดิมด้านบน) ดู
                // docblock ของ migration add_auto_created_platform_to_attributes_table
                'auto_created_platform' => 'woocommerce',
                'is_required' => false,
                'is_unique' => false,
                'is_locale_based' => false,
                'is_channel_based' => false,
                'is_filterable' => false,
            ]));
        } catch (UniqueConstraintViolationException) {
            $winner = Attribute::where('code', $code)->first();
            if ($winner && $winner->type === self::PIM_TYPE) {
                return $winner;
            }

            if ($attemptsLeft <= 1) {
                throw new RuntimeException("Could not create a uniquely-coded attribute for '{$label}' after several concurrent attempts.");
            }

            return $this->createAttributeAt($this->disambiguateCode($code), $label, $attemptsLeft - 1);
        }

        $this->setDefaultLocaleLabel($attribute->id, $label);

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
            // เหตุผลเดียวกับ LazadaMappedAttributeCreator::sanitizeCode()'s
            // docblock — ผูก fallback เข้ากับ hash ของชื่อต้นทาง ไม่ใช่ค่าคงที่
            // ตายตัว กัน attribute คนละตัวที่ชื่อไม่เหลือ a-z เลย sanitize ไป
            // เป็นโค้ดเดียวกันหมด
            $code = 'wc_'.substr(md5($rawName), 0, 10);
        }

        return mb_substr($code, 0, 100);
    }

    private function setDefaultLocaleLabel(int $attributeId, string $label): void
    {
        $defaultLocaleId = Locale::where('code', config('app.locale'))->value('id')
            ?? Locale::where('enabled', true)->orderBy('id')->value('id');

        if (!$defaultLocaleId) {
            return;
        }

        AttributeTranslation::updateOrCreate(
            ['attribute_id' => $attributeId, 'locale_id' => $defaultLocaleId],
            ['label' => $label]
        );
    }
}
