<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * DB cleanup Phase 3b-1 — product_category คือที่เก็บหมวดหมู่ที่เดียว และสินค้า 1 ตัวอยู่ได้หมวดเดียว
 * (สายเดียว root → หมวดย่อย → กลุ่มสินค้า) ส่วน pcatid/pcatname/psubcatname/productgroupname เป็นค่าที่
 * คำนวณจาก tree (ProductCategoryLinker::deriveLegacyCodesFromCategories)
 *
 * ต่อสินค้า:
 *   1. ไม่มีหมวดใน tree แต่มี code ใน attribute → ผูกหมวดที่ลึกที่สุดที่ code ตรงกัน (ไม่สนตัวพิมพ์ —
 *      option เก็บตัวพิมพ์เล็ก) หมวดที่ code ชนกันเมื่อไม่สนตัวพิมพ์ (L001/l001) → ไม่แตะ รายงานให้เปลี่ยน code
 *      code ที่ไม่มีหมวดจริง (เช่น category_2) → ไม่แตะ รายงานให้แก้เอง
 *   2. tree มีหลายสาย → เก็บสายที่ตรงกับ code ใน attribute ถ้าไม่มีสายไหนตรง → ไม่แตะ รายงานให้แก้เอง
 *   3. ผูกให้ครบทั้งสาย (เติมหมวดแม่ที่ขาด ถอดหมวดนอกสาย)
 *   4. คำนวณ attribute ทั้ง 4 ตัวใหม่จาก tree
 *   สินค้าที่หมวดเปลี่ยน → เติม attribute_group_id ให้ค่าเดิมตาม family ใหม่ (pim:backfill-product-value-groups)
 *
 * แถวที่แก้ export เป็น CSV ใน storage/app/backups ก่อนเสมอ
 */
class NormalizeProductCategoriesCommand extends Command
{
    protected $signature = 'pim:normalize-product-categories {--dry-run : แสดงสรุป + export CSV โดยไม่แก้จริง}';

    protected $description = 'Phase 3b-1: make product_category the single category source (one chain per product) and re-derive pcatid/pcatname/psubcatname/productgroupname from it.';

    private const CODE_ATTRIBUTES = ['pcatid', 'pcatname', 'psubcatname', 'productgroupname'];

    /** @var array<int, array<int, mixed>> */
    private array $log = [];

    /** @var array<string, int> */
    private array $stats = [
        'linked_from_codes' => 0, 'unlinkable_codes' => 0, 'multi_resolved' => 0, 'multi_unresolved' => 0,
        'parents_added' => 0, 'links_removed' => 0, 'values_changed' => 0, 'missing_option' => 0, 'case_clash' => 0,
    ];

    /** @var array<int, Category> */
    private array $categoriesById = [];

    /** @var array<int, true> หมวดที่ code ชนกับหมวดอื่นเมื่อไม่สนตัวพิมพ์ */
    private array $clashingCategoryIds = [];

    private bool $dryRun = false;

    /** @var array<string, int> attribute code => id */
    private array $attributeIds = [];

    /** @var array<int, array<string, true>> attribute id => option codes */
    private array $optionCodes = [];

    public function handle(): int
    {
        // dry-run คำนวณแผนอย่างเดียว ไม่เขียน DB — รันจริงทำทีละ chunk ใน transaction ของ chunk นั้น
        // (transaction เดียวทั้งหมด + updateOrCreate ที่เปิด savepoint ทุกแถว ทำ PostgreSQL หน่วยความจำ lock หมด)
        $this->dryRun = (bool) $this->option('dry-run');
        $this->categoriesById = Category::all(['id', 'code', 'parent_id'])->keyBy('id')->all();
        // code ใน attribute/option เป็นตัวพิมพ์เล็กเสมอ (AttributeOptionMirror::normaliseCode) — จับคู่กับหมวดแบบไม่สน
        // ตัวพิมพ์ หมวดที่ code ชนกันเมื่อไม่สนตัวพิมพ์ (เช่น L001 กับ l001) แยกไม่ออก → ไม่แตะ รายงานให้เปลี่ยน code ก่อน
        $categoryIdByCode = [];
        foreach ($this->categoriesById as $category) {
            $categoryIdByCode[strtolower(trim($category->code))][] = (int) $category->id;
        }
        foreach ($categoryIdByCode as $lower => $ids) {
            if (count($ids) > 1) {
                foreach ($ids as $id) {
                    $this->clashingCategoryIds[$id] = true;
                }
            }
        }
        $this->attributeIds = Attribute::whereIn('code', self::CODE_ATTRIBUTES)->pluck('id', 'code')->map(fn ($id) => (int) $id)->all();
        foreach ($this->attributeIds as $attributeId) {
            $this->optionCodes[$attributeId] = DB::table('attribute_options')->where('attribute_id', $attributeId)->pluck('code')->flip()->map(fn () => true)->all();
        }
        $codeOf = array_flip($this->attributeIds);
        $changedProductIds = [];

        $progress = $this->output->createProgressBar(Product::count());
        $progress->start();

        Product::query()->orderBy('id')->chunkById(500, function ($products) use ($categoryIdByCode, $codeOf, &$changedProductIds, $progress) {
            $links = DB::table('product_category')->whereIn('product_id', $products->pluck('id'))->get()
                ->groupBy('product_id')->map(fn ($rows) => $rows->pluck('category_id')->map(fn ($id) => (int) $id)->all());
            $values = DB::table('product_values')->whereIn('product_id', $products->pluck('id'))
                ->whereIn('attribute_id', array_values($this->attributeIds))->whereNull('channel_id')
                ->orderByRaw('locale_id IS NOT NULL')->get(['product_id', 'attribute_id', 'value'])
                ->groupBy('product_id');

            $apply = function () use ($products, $links, $values, $codeOf, $categoryIdByCode, &$changedProductIds) {
                foreach ($products as $product) {
                    $current = $links->get($product->id, []);
                    $codes = [];
                    foreach ($values->get($product->id, collect()) as $row) {
                        $codes[$codeOf[$row->attribute_id]] ??= $row->value;
                    }

                    $target = $this->targetChain($product, $current, $codes, $categoryIdByCode);
                    if ($target === null) {
                        continue; // ไม่มีอะไรให้ผูก หรือต้องแก้เอง — รายงานไว้แล้ว
                    }

                    if ($this->syncLinks($product, $current, $target)) {
                        $changedProductIds[] = $product->id;
                    }
                    $this->deriveCodes($product, $target, $codes);
                }
            };

            $this->dryRun ? $apply() : DB::transaction($apply);
            $progress->advance($products->count());
        });

        $progress->finish();
        $this->newLine(2);

        $this->report();

        if ($this->dryRun) {
            $this->line(count($changedProductIds).' product(s) would get attribute groups re-assigned (pim:backfill-product-value-groups) after their category changed');
            $this->info('Dry run — nothing changed.');

            return self::SUCCESS;
        }

        foreach (array_chunk($changedProductIds, 500) as $ids) {
            $this->call('pim:backfill-product-value-groups', ['--product' => $ids]);
        }
        if ($changedProductIds) {
            Product::bumpStorefrontVersion(); // หน้าร้าน cache ชื่อหมวดที่มาจาก tree
        }
        $this->info('Done.');

        return self::SUCCESS;
    }

    /**
     * สายหมวดที่สินค้าควรผูก (root → leaf) หรือ null ถ้าไม่มี/ต้องแก้เอง
     *
     * @param  array<int, int>  $current
     * @param  array<string, string>  $codes
     * @param  array<string, array<int, int>>  $categoryIdByCode  code ตัวพิมพ์เล็ก => id หมวด
     * @return array<int, int>|null
     */
    private function targetChain(Product $product, array $current, array $codes, array $categoryIdByCode): ?array
    {
        $current = array_values(array_filter($current, fn ($id) => isset($this->categoriesById[$id])));

        if (empty($current)) {
            $wanted = array_filter([$codes['productgroupname'] ?? null, $codes['psubcatname'] ?? null, $codes['pcatname'] ?? null]);
            if (empty($wanted)) {
                return null;
            }
            foreach ($wanted as $code) {
                $ids = $categoryIdByCode[strtolower(trim($code))] ?? [];
                if (count($ids) > 1) {
                    $this->stats['case_clash']++;
                    $this->log[] = ['case_clash', $product->sku, $code, '', implode('/', $wanted)];

                    return null;
                }
                if (count($ids) === 1) {
                    $this->stats['linked_from_codes']++;
                    $this->log[] = ['link_from_codes', $product->sku, $code, '', implode('/', $wanted)];

                    return $this->chainOf($ids[0]);
                }
            }
            $this->stats['unlinkable_codes']++;
            $this->log[] = ['unlinkable_codes', $product->sku, '', '', implode('/', $wanted)];

            return null;
        }

        // leaf = หมวดที่ผูกอยู่และไม่มีหมวดลูกที่ผูกอยู่ด้วย
        $leaves = array_values(array_filter($current, function (int $id) use ($current) {
            foreach ($current as $other) {
                if ($other !== $id && in_array($id, $this->chainOf($other), true)) {
                    return false;
                }
            }

            return true;
        }));

        if (count($leaves) === 1) {
            return $this->chainOf($leaves[0]);
        }

        // หลายสาย → สายที่ leaf ตรงกับ code ใน attribute ถ้าตรงหลายสาย เอาสายที่ลึกที่สุด (ลึกเท่ากัน = แก้เอง)
        $lowerCodes = array_map(fn ($code) => strtolower(trim((string) $code)), $codes);
        $matching = array_values(array_filter($leaves, fn (int $id) => in_array(strtolower(trim($this->categoriesById[$id]->code)), $lowerCodes, true)));
        usort($matching, fn (int $a, int $b) => count($this->chainOf($b)) <=> count($this->chainOf($a)));
        if (count($matching) > 1 && count($this->chainOf($matching[0])) > count($this->chainOf($matching[1]))) {
            $matching = [$matching[0]];
        }
        $leafCodes = implode(', ', array_map(fn ($id) => $this->categoriesById[$id]->code, $leaves));
        if (count($matching) === 1) {
            $this->stats['multi_resolved']++;
            $this->log[] = ['multi_resolved', $product->sku, $this->categoriesById[$matching[0]]->code, $leafCodes, implode('/', $codes)];

            return $this->chainOf($matching[0]);
        }

        $this->stats['multi_unresolved']++;
        $this->log[] = ['multi_unresolved', $product->sku, '', $leafCodes, implode('/', $codes)];

        return null;
    }

    /**
     * @param  array<int, int>  $current
     * @param  array<int, int>  $target
     */
    private function syncLinks(Product $product, array $current, array $target): bool
    {
        $add = array_values(array_diff($target, $current));
        $remove = array_values(array_diff($current, $target));
        if (! $add && ! $remove) {
            return false;
        }

        if ($current) {
            $this->stats['parents_added'] += count($add);
        }
        $this->stats['links_removed'] += count($remove);
        foreach ($add as $id) {
            $this->log[] = ['link_add', $product->sku, $this->categoriesById[$id]->code ?? $id, '', ''];
        }
        foreach ($remove as $id) {
            $this->log[] = ['link_remove', $product->sku, $this->categoriesById[$id]->code ?? $id, '', ''];
        }

        if (! $this->dryRun) {
            $product->categories()->sync($target);
        }

        return true;
    }

    /**
     * @param  array<int, int>  $target
     * @param  array<string, string>  $before
     */
    private function deriveCodes(Product $product, array $target, array $before): void
    {
        // เหมือน ProductCategoryLinker::deriveLegacyCodesFromCategories() — เขียนเฉพาะ code ที่เป็น option จริง
        // ไม่งั้นลบ — แต่เขียนตรงด้วย query builder (ไม่ใช้ updateOrCreate/savepoint)
        $clashing = array_values(array_filter($target, fn (int $id) => isset($this->clashingCategoryIds[$id])));
        if ($clashing) {
            $this->stats['case_clash']++;
            $this->log[] = ['case_clash', $product->sku, implode(', ', array_map(fn ($id) => $this->categoriesById[$id]->code, $clashing)), '', implode('/', $before)];

            return;
        }

        // เหมือน ProductCategoryLinker::legacyCodesFromCategories() แต่ใช้หมวดที่โหลดไว้แล้ว — ตัวนั้นโหลด
        // categories ทั้งตารางใหม่ทุกครั้งที่เรียก (ต่อสินค้า 1 ตัว) ทำให้คำสั่งช้ามากบนสินค้าหลายพันตัว
        $levelCode = fn (int $level) => isset($target[$level]) ? strtolower(trim($this->categoriesById[$target[$level]]->code)) : null;
        $expected = ['pcatid' => $levelCode(0), 'pcatname' => $levelCode(0), 'psubcatname' => $levelCode(1), 'productgroupname' => $levelCode(2)];
        $changed = false;

        foreach (self::CODE_ATTRIBUTES as $code) {
            $attributeId = $this->attributeIds[$code] ?? null;
            if (! $attributeId) {
                continue;
            }
            $new = $expected[$code] ?? null;
            $old = $before[$code] ?? null;
            if ($new !== null && ! isset($this->optionCodes[$attributeId][$new])) {
                // หมวดนี้ยังไม่มี option (master ยังไม่ sync) — ไม่ลบ/ไม่แก้ค่าเดิม รายงานให้รัน
                // catalog:sync-master-options แล้วรันคำสั่งนี้ซ้ำ
                if ($old !== $new) {
                    $this->stats['missing_option']++;
                    $this->log[] = ['missing_option', $product->sku, $code, $old ?? '', $new];
                }

                continue;
            }
            if ($old === $new) {
                continue;
            }

            $changed = true;
            $this->log[] = ['value', $product->sku, $code, $old ?? '', $new ?? ''];
            if ($this->dryRun) {
                continue;
            }

            $scope = DB::table('product_values')->where('product_id', $product->id)->where('attribute_id', $attributeId)->whereNull('channel_id');
            if ($new === null) {
                $scope->delete();
            } elseif ((clone $scope)->exists()) {
                (clone $scope)->whereNotNull('locale_id')->delete(); // ไม่แยกภาษา — เหลือแถว NULL แถวเดียว
                if (! (clone $scope)->whereNull('locale_id')->update(['value' => $new])) {
                    DB::table('product_values')->insert(['product_id' => $product->id, 'attribute_id' => $attributeId, 'value' => $new]);
                }
            } else {
                DB::table('product_values')->insert(['product_id' => $product->id, 'attribute_id' => $attributeId, 'value' => $new]);
            }
        }

        if ($changed) {
            $this->stats['values_changed']++;
        }
    }

    /**
     * @return array<int, int> root → $id
     */
    private function chainOf(int $id): array
    {
        return $this->chainCache[$id] ??= $this->buildChain($id);
    }

    /** @var array<int, array<int, int>> */
    private array $chainCache = [];

    /**
     * @return array<int, int>
     */
    private function buildChain(int $id): array
    {
        $chain = [];
        $seen = [];
        for ($cur = $id; $cur !== null && isset($this->categoriesById[$cur]) && ! isset($seen[$cur]); $cur = $this->categoriesById[$cur]->parent_id) {
            $seen[$cur] = true;
            array_unshift($chain, $cur);
        }

        return $chain;
    }

    private function report(): void
    {
        $s = $this->stats;
        $this->line("1) {$s['linked_from_codes']} product(s) linked to the tree from their codes; {$s['unlinkable_codes']} with codes that match no category (left as-is — fix by hand)");
        $this->line("2) multi-chain products: {$s['multi_resolved']} resolved to the chain matching their codes, {$s['multi_unresolved']} left as-is (no chain matches — fix by hand)");
        $this->line("3) {$s['parents_added']} missing parent link(s) added, {$s['links_removed']} off-chain link(s) removed");
        $this->line("4) {$s['values_changed']} product(s) had pcatid/pcatname/psubcatname/productgroupname re-derived from the tree");
        if ($s['case_clash']) {
            $this->warn("   {$s['case_clash']} product(s) skipped: their category code clashes with another category's when case is ignored (e.g. L001 vs l001) — give one of them a different code on the category page, then re-run");
        }
        if ($s['missing_option']) {
            $this->warn("   {$s['missing_option']} value(s) skipped: their category has no attribute option yet — run `php artisan catalog:sync-master-options`, then re-run this command");
        }

        foreach (['unlinkable_codes', 'multi_unresolved', 'case_clash'] as $action) {
            $rows = array_values(array_filter($this->log, fn ($row) => $row[0] === $action));
            if ($rows) {
                $this->warn("Needs a manual fix ({$action}):");
                $this->table(['SKU', 'Linked leaves', 'Attribute codes'], array_map(fn ($row) => [$row[1], $row[3], $row[4]], array_slice($rows, 0, 30)));
            }
        }

        $path = 'backups/normalize_product_categories_'.now()->format('Ymd_His').($this->dryRun ? '_dryrun' : '').'.csv';
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\xEF\xBB\xBF"); // BOM — ให้ Excel อ่านภาษาไทยถูก
        fputcsv($handle, ['action', 'sku', 'code', 'old', 'new_or_detail']);
        foreach ($this->log as $row) {
            fputcsv($handle, $row);
        }
        rewind($handle);
        Storage::disk('local')->put($path, stream_get_contents($handle));
        fclose($handle);

        $this->line('Changed rows exported to: '.Storage::disk('local')->path($path));
    }
}
