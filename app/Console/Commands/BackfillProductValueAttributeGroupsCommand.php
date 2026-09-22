<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\EffectiveFamilyAttributeResolver;
use Illuminate\Console\Command;

/**
 * Backfill for migration 2026_09_23_000001_add_attribute_group_id_to_product_values_table
 * — ทุกแถวเดิมใน product_values เป็น attribute_group_id = NULL หลัง migrate
 * คำสั่งนี้เติมค่าที่ถูกต้องให้ โดย reproduce ตรรกะ "attribute ตัวนี้ของสินค้า
 * ตัวนี้ควรอยู่ group ไหนบ้างตอนนี้" ตัวเดียวกับหน้าแก้ไขสินค้า (ผ่าน
 * EffectiveFamilyAttributeResolver ตัวเดียวกับที่ ProductController ใช้)
 *
 * แยกจาก migration เองโดยตั้งใจ (ตามธรรมเนียมเดิมของ repo นี้ —
 * BackfillCategoryTranslationsCommand/BackfillMasterTranslationsCommand ก็
 * เป็นคำสั่งแยกทั้งคู่ ไม่มีตัวไหนถูกเรียกจากใน migration เอง) เพื่อให้ deploy
 * schema กับรัน backfill จริงแยกจังหวะกันได้ (เช่น รันตอนดึกที่ทราฟฟิกน้อย)
 * และกู้คืนได้ถ้า backfill ล้มกลางคัน โดยไม่ทำให้ตาราง migrations ค้าง
 *
 * รันซ้ำได้ปลอดภัยเสมอ (idempotent) — ดูเฉพาะแถวที่ attribute_group_id ยัง
 * เป็น NULL อยู่เท่านั้น แถวที่ backfill ไปแล้วจะไม่ถูกแตะอีก
 *
 * ต่อ 1 attribute ที่ตอนนี้ resolve ได้มากกว่า 1 group (เช่น attribute ที่ถูกใส่
 * ไว้ทั้ง "สเปค" และ "ภายในสเปค") แถวเดิมจะถูกย้ายไปอยู่ group แรก (ตามลำดับ
 * priority เดียวกับที่หน้าแก้ไขสินค้าใช้) ส่วน group ที่เหลือจะถูกคัดลอกค่าเดิม
 * ไปให้ใหม่ทั้งหมด (ค่าเหมือนกันทุก group ทันทีหลัง backfill — ผู้ใช้ค่อยไปแก้
 * แต่ละ group ให้ต่างกันเองทีหลังได้ ไม่มีอะไรมองเห็นเปลี่ยนไปทันทีที่รันคำสั่งนี้)
 *
 * หมายเหตุ: รันซ้ำ "ไม่" ย้อนไปเติมค่าให้ placement ที่เพิ่งถูกเพิ่มทีหลัง (หลัง
 * backfill รอบแรกไปแล้ว) — ตั้งใจแบบนั้น เพราะ placement ใหม่จริงๆ ไม่มีค่าเดิม
 * ให้ copy มาใส่ (แถวเดิมมี attribute_group_id ตั้งไว้แล้ว ไม่ใช่ NULL อีกต่อไป
 * เลยไม่เข้าเงื่อนไขการสแกนของคำสั่งนี้) ควรเริ่มว่างเปล่าตามปกติ
 */
class BackfillProductValueAttributeGroupsCommand extends Command
{
    protected $signature = 'pim:backfill-product-value-groups';

    protected $description = 'Backfill attribute_group_id on existing product_values rows so each attribute-group placement can hold an independent value.';

    public function handle(EffectiveFamilyAttributeResolver $resolver): int
    {
        $processedProducts = 0;
        $updated = 0;
        $duplicated = 0;

        // Cache the "attribute_id -> [group_id, ...]" map per distinct
        // effectiveFamilyIds() signature — family_attributes is a small
        // global table, so most products sharing the same bound families
        // (the common case) resolve it only once per chunk, not once per
        // product.
        $mapCache = [];

        Product::query()
            ->orderBy('id')
            ->chunk(200, function ($products) use ($resolver, &$mapCache, &$processedProducts, &$updated, &$duplicated) {
                $products->load('categories:id');

                $rowsByProduct = ProductValue::whereIn('product_id', $products->pluck('id'))
                    ->whereNull('attribute_group_id')
                    ->get()
                    ->groupBy('product_id');

                foreach ($products as $product) {
                    $processedProducts++;

                    $productRows = $rowsByProduct->get($product->id, collect());
                    if ($productRows->isEmpty()) {
                        continue;
                    }

                    $familyIds = $resolver->effectiveFamilyIds($product);
                    $signature = implode(',', $familyIds);

                    if (! array_key_exists($signature, $mapCache)) {
                        $mapCache[$signature] = $this->buildAttributeGroupMap($resolver, $familyIds);
                    }
                    $attributeGroupMap = $mapCache[$signature];

                    foreach ($productRows as $row) {
                        $groupIds = $attributeGroupMap[$row->attribute_id] ?? [];
                        if (empty($groupIds)) {
                            // attribute ไม่ได้ผูกกับ group ไหนเลยตอนนี้ (ระบบ/
                            // master-category attribute, หรือ family ที่เคยผูก
                            // attribute นี้ไว้ไม่ได้เป็น effective family ของ
                            // สินค้านี้อีกแล้ว) — คงเป็น NULL ตามเดิม
                            continue;
                        }

                        $row->attribute_group_id = $groupIds[0];
                        $row->save();
                        $updated++;

                        for ($i = 1; $i < count($groupIds); $i++) {
                            ProductValue::create([
                                'product_id' => $row->product_id,
                                'attribute_id' => $row->attribute_id,
                                'attribute_group_id' => $groupIds[$i],
                                'channel_id' => $row->channel_id,
                                'locale_id' => $row->locale_id,
                                'value' => $row->value,
                            ]);
                            $duplicated++;
                        }
                    }
                }

                $this->line("  ...{$processedProducts} product(s) scanned so far ({$updated} row(s) assigned a group, {$duplicated} duplicated)");
            });

        $this->info("Done. {$processedProducts} product(s) scanned, {$updated} row(s) assigned a group, {$duplicated} row(s) duplicated into additional group placements.");
        $this->info('Safe to re-run — rows that already have a group are left untouched.');

        return self::SUCCESS;
    }

    /**
     * @param  array<int, int>  $familyIds
     * @return array<int, array<int, int>>  attribute_id => [attribute_group_id, ...]
     */
    private function buildAttributeGroupMap(EffectiveFamilyAttributeResolver $resolver, array $familyIds): array
    {
        if (empty($familyIds)) {
            return [];
        }

        $map = [];
        foreach ($resolver->resolveEffectiveFamilyAttributes($familyIds) as $row) {
            $map[$row->attribute_id][] = $row->attribute_group_id;
        }

        return $map;
    }
}
