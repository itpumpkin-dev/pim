<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\ProductCategoryLinker;
use Illuminate\Console\Command;

/**
 * ทำงานกลับทางกับ app:link-product-categories-from-codes — คำนวณ
 * pcatid/pcatname/psubcatname/productgroupname ใหม่จากต้นไม้หมวดหมู่
 * (product_category) แล้วเขียนลง product_values ให้ทุกสินค้าในรอบเดียว ผ่าน
 * ProductCategoryLinker::deriveLegacyCodesFromCategories() ตัวเดียวกับที่หน้า
 * Edit Product เรียกตอนกด Save — ผลลัพธ์จึงเหมือนการเปิดแก้ไขแล้วกด Save
 * ทีละตัวทุกประการ (รวมถึงกฎ "เขียนเฉพาะ code ที่เป็น option จริงของ attribute
 * นั้น ไม่งั้นล้างค่าทิ้ง")
 *
 * สินค้าที่ยังไม่มีหมวดหมู่เลยจะถูกข้ามโดยตั้งใจ — deriveLegacyCodesFromCategories()
 * กับ categoryIds ว่างจะลบค่าเดิมทิ้งทั้ง 4 ตัว ซึ่งสำหรับสินค้ากลุ่มนี้ค่าเดิม
 * อาจเป็นข้อมูลเดียวที่เหลือไว้ใช้ผูกต้นไม้กลับด้วย
 * app:link-product-categories-from-codes
 *
 * เขียนเฉพาะสินค้าที่ค่าคำนวณได้ต่างจากค่าปัจจุบันจริงๆ เท่านั้น รันซ้ำได้ปลอดภัย
 * (idempotent) — รอบที่สองจะไม่เขียนอะไรเลย
 */
class SyncLegacyCategoryCodesCommand extends Command
{
    private const CODES = ['pcatid', 'pcatname', 'psubcatname', 'productgroupname'];

    protected $signature = 'pim:sync-legacy-category-codes
        {--sku=* : จำกัดเฉพาะ SKU ที่ระบุ (ใส่ได้หลายตัว)}
        {--dry-run : แสดงผลว่าจะเปลี่ยนอะไรบ้าง โดยไม่เขียนลง DB}';

    protected $description = 'Rewrite pcatid/pcatname/psubcatname/productgroupname product values from each product\'s category tree (product_category), same as saving the product edit page.';

    public function handle(): int
    {
        $attributeIds = Attribute::whereIn('code', self::CODES)->pluck('id', 'code');
        if ($attributeIds->isEmpty()) {
            $this->error('None of '.implode('/', self::CODES).' exist as attributes.');

            return self::FAILURE;
        }

        // option code ที่ใช้ได้จริงต่อ attribute — ใช้แค่เทียบว่า "จะเปลี่ยนไหม"
        // ส่วนการเขียนจริงให้ deriveLegacyCodesFromCategories() ตรวจเองตามเดิม
        $validCodes = AttributeOption::whereIn('attribute_id', $attributeIds)
            ->get(['attribute_id', 'code'])
            ->groupBy('attribute_id')
            ->map(fn ($options) => $options->pluck('code')->flip());

        $dryRun = (bool) $this->option('dry-run');
        $skus = array_filter((array) $this->option('sku'));

        $scanned = 0;
        $changedProducts = 0;
        $changes = ['set' => 0, 'changed' => 0, 'cleared' => 0];
        $samples = [];

        Product::query()
            ->whereHas('categories')
            ->when($skus, fn ($query) => $query->whereIn('sku', $skus))
            ->orderBy('id')
            ->chunkById(200, function ($products) use ($attributeIds, $validCodes, $dryRun, &$scanned, &$changedProducts, &$changes, &$samples) {
                $products->load('categories:id');

                $currentByProduct = ProductValue::whereIn('product_id', $products->pluck('id'))
                    ->whereIn('attribute_id', $attributeIds)
                    ->whereNull('channel_id')
                    ->whereNull('locale_id')
                    ->get(['product_id', 'attribute_id', 'value'])
                    ->groupBy('product_id');

                foreach ($products as $product) {
                    $scanned++;
                    $categoryIds = $product->categories->pluck('id')->all();
                    $expected = ProductCategoryLinker::legacyCodesFromCategories($categoryIds);
                    $current = $currentByProduct->get($product->id, collect())->pluck('value', 'attribute_id');

                    $diff = [];
                    foreach ($attributeIds as $code => $attributeId) {
                        $want = $expected[$code] ?? null;
                        if ($want !== null && ! isset($validCodes[$attributeId][$want])) {
                            $want = null;
                        }
                        $have = $current->get($attributeId);
                        $have = ($have === null || $have === '') ? null : (string) $have;

                        if ($want === $have) {
                            continue;
                        }

                        $kind = $have === null ? 'set' : ($want === null ? 'cleared' : 'changed');
                        $changes[$kind]++;
                        $diff[] = "{$code}: ".($have ?? '∅').' → '.($want ?? '∅');
                    }

                    if ($diff === []) {
                        continue;
                    }

                    $changedProducts++;
                    if (count($samples) < 15) {
                        $samples[] = [$product->sku, implode(', ', $diff)];
                    }

                    if (! $dryRun) {
                        ProductCategoryLinker::deriveLegacyCodesFromCategories($product, $categoryIds);
                    }
                }
            });

        if ($samples !== []) {
            $this->table(['SKU', 'Changes (current → from category tree)'], $samples);
            if ($changedProducts > count($samples)) {
                $this->line('  ... and '.($changedProducts - count($samples)).' more product(s)');
            }
        }

        $summary = "{$scanned} product(s) with categories scanned, {$changedProducts} ".($dryRun ? 'would change' : 'updated')
            ." ({$changes['set']} value(s) set, {$changes['changed']} changed, {$changes['cleared']} cleared).";
        $dryRun ? $this->warn('[dry-run] '.$summary.' Nothing was written.') : $this->info($summary);

        return self::SUCCESS;
    }
}
