<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Models\Category;
use App\Models\CategoryTranslation;
use App\Models\Locale;
use App\Services\AttributeAutoTranslator;
use App\Services\Catalog\MasterAttributeOptionSync;
use Illuminate\Console\Command;

/**
 * Backfill for the `categories` tree specifically (Categories/Subcategories/
 * Product Groups all share this one table, split by depth — see
 * MasterAttributeOptionSync's category-depth handling) — separate from
 * BackfillMasterTranslationsCommand because Category's shape genuinely
 * differs (self-referencing tree, its own translation FK/model, 3 mirrored
 * attributes instead of 1) and there's already an existing command for a
 * *related* but narrower job: `app:translate-missing-category-labels`
 * (TranslateMissingCategoryLabels) queues AutoTranslateLabelsJob for any
 * category that has translations in SOME locale but not others — it never
 * considers the raw `name` column at all, so a category with literally zero
 * translation rows (confirmed: virtually the entire tree — 1091 of 1095
 * rows had none) gets silently skipped by it forever, with no source label
 * to translate from. This command exists purely to cover that gap: for a
 * category with no translation anywhere yet, it uses the raw `name` column
 * as the source — verified by hand first (unlike the mistake made building
 * BackfillMasterTranslationsCommand's first draft) that `name` here really
 * is Thai text, not English, so it's written as the `th` translation
 * before translating into the other active locales from there.
 *
 * Runs synchronously — same reasoning as BackfillMasterTranslationsCommand
 * (predictable, no queue worker dependency, safe to run in production on
 * demand). With ~1,095 rows and up to 2 target locales each, this is a lot
 * of real translation-provider calls and will take a while; that's expected
 * for a one-time backfill of a tree that was never translated past however
 * it was first entered.
 */
class BackfillCategoryTranslationsCommand extends Command
{
    protected $signature = 'catalog:backfill-category-translations';

    protected $description = 'Fill in missing translations for the categories/subcategories/product-groups tree, then resync the 3 attributes that mirror it.';

    public function handle(AttributeAutoTranslator $translator): int
    {
        $enLocaleId = Locale::idForCode('en');

        $filled = 0;
        $skipped = 0;

        Category::query()
            ->with('translations')
            ->orderBy('id')
            ->chunk(200, function ($categories) use ($translator, $enLocaleId, &$filled, &$skipped) {
                foreach ($categories as $category) {
                    [$sourceLocaleId, $sourceLabel] = $this->resolveSource($category, $enLocaleId);
                    if ($sourceLocaleId === null || $sourceLabel === '') {
                        $skipped++;

                        continue;
                    }

                    $translator->fillMissing(CategoryTranslation::class, 'category_id', $category->id, $sourceLocaleId, $sourceLabel);
                    $filled++;
                }

                $this->line("  ...{$filled} processed so far");
            });

        $this->info("{$filled} row(s) processed, {$skipped} skipped (no label in any locale, including the raw name column).");

        if ($filled > 0) {
            // ต้อง bump ทุกครั้งที่มีการแก้ label ของ category — AutoTranslateLabelsJob
            // เองก็ทำแบบนี้ตอนถูก dispatch จาก path ปกติ (ดู docblock ของมัน) แต่คำสั่งนี้
            // เรียก fillMissing() ตรงๆ ไม่ผ่าน job เลยต้องทำเองตรงนี้แทน ไม่งั้น cache
            // ต้นไม้ categories (TTL 6 ชม.) จะยังโชว์ label เก่าค้างอยู่
            Category::bumpTreeCacheVersion();

            $this->info('Resyncing mirrored attribute options (pcatname/psubcatname/productgroupname)...');
            $sync = app(MasterAttributeOptionSync::class);
            foreach (Attribute::whereIn('master_source', ['categories', 'subcategories', 'product_groups'])->get() as $attribute) {
                $sync->rebuildAttribute($attribute);
                $this->line("  resynced attribute '{$attribute->code}' (master_source={$attribute->master_source})");
            }
        }

        $this->info('Done.');

        return self::SUCCESS;
    }

    /**
     * Same priority as BackfillMasterTranslationsCommand::resolveSource():
     * prefer an existing `en` translation, then whichever locale already
     * has a non-empty one, and only as a last resort — a category with no
     * translation anywhere yet — the raw `name` column (confirmed to be
     * Thai for this dataset, so that's the locale it's attributed to here,
     * NOT `en`).
     *
     * @return array{0: int|null, 1: string}
     */
    private function resolveSource(Category $category, ?int $enLocaleId): array
    {
        if ($enLocaleId !== null) {
            $enLabel = trim((string) ($category->translations->firstWhere('locale_id', $enLocaleId)?->label ?? ''));
            if ($enLabel !== '') {
                return [$enLocaleId, $enLabel];
            }
        }

        foreach ($category->translations as $translation) {
            $label = trim((string) $translation->label);
            if ($label !== '') {
                return [(int) $translation->locale_id, $label];
            }
        }

        $rawName = trim((string) $category->name);
        if ($rawName === '') {
            return [null, ''];
        }

        $thLocaleId = Locale::idForCode('th');
        if ($thLocaleId === null) {
            return [null, ''];
        }

        CategoryTranslation::updateOrCreate(
            ['category_id' => $category->id, 'locale_id' => $thLocaleId],
            ['label' => $rawName]
        );

        return [$thLocaleId, $rawName];
    }
}
