<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Models\BaseUnit;
use App\Models\BaseUnitTranslation;
use App\Models\Brand;
use App\Models\BrandTranslation;
use App\Models\BusinessType;
use App\Models\BusinessTypeTranslation;
use App\Models\Currency;
use App\Models\CurrencyTranslation;
use App\Models\Locale;
use App\Models\ProductGrade;
use App\Models\ProductGradeTranslation;
use App\Models\Vendor;
use App\Models\VendorTranslation;
use App\Services\AttributeAutoTranslator;
use App\Services\Catalog\MasterAttributeOptionSync;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;

/**
 * Backfill: fills in missing translations for the 6 catalog masters that
 * share the "flat `name` column + one-row-per-locale translations table"
 * shape (Business Types, Brands, Base Units, Product Grades, Vendors,
 * Currencies) — same shape as Product Types, whose list page turning out to
 * always show English regardless of locale is what surfaced this. `name` on
 * every one of these models is *documented* as just the app's default-
 * locale (en) fallback, but that turned out not to be reliable in practice —
 * Business Types' `name` column, for one, is actually Thai text (whoever
 * entered this data typed straight into it, translations be damned). This
 * command found that out the hard way on its first version: it used to
 * treat `name` as "the English source" unconditionally and write it
 * straight into an `en` translation row before translating from there —
 * for Business Types that meant creating 27 "en" rows that were just Thai
 * text again, and mirroring that into the `business_type` attribute's
 * options too, since is_customized never got a chance to protect anything
 * that was never customized to begin with. Caught and reverted before this
 * command ran for anything else (see PRs — er, see the conversation this
 * shipped in) — this version fixes it by never trusting `name`'s language:
 * it only ever uses a locale as the source if that locale ALREADY has a
 * real translation row (preferring `en` if one exists, otherwise whichever
 * locale has one — same priority AttributeOptionController/*Controller's
 * own resolveAutoTranslateSource() uses elsewhere), and only falls back to
 * the raw `name` column when a row has no translation in ANY locale yet
 * (at which point there's nothing better to go on anyway).
 *
 * Deliberately only fills locales that have NO translation row at all for
 * a given master row — it does NOT touch/replace any existing translation
 * regardless of its content. An "identical to the source = probably
 * untranslated, retranslate it" heuristic (used once, by hand, for Product
 * Types after manually eyeballing every row) is deliberately NOT automated
 * here — it would be wrong for Brands/Vendors in particular, where a name
 * legitimately staying identical across languages (a proper noun, a
 * company name) is common and correct, not a sign of a missed translation.
 * Any master still showing the same text in every locale after this
 * command needs a human to check it, not another automated pass.
 *
 * Runs synchronously (not queued) — each row is a handful of real calls to
 * whatever translation provider is configured as default+enabled (skips
 * everything, safely, if none is), so this can take a few minutes for a
 * large dataset. Meant to be run on demand (locally or in production via
 * `php artisan catalog:backfill-master-translations`), not on every deploy —
 * safe to re-run any number of times, since anything already translated is
 * left untouched and simply costs one extra "nothing to do" check.
 */
class BackfillMasterTranslationsCommand extends Command
{
    protected $signature = 'catalog:backfill-master-translations
        {--only=* : Limit to one or more of: business_types,brands,base_units,product_grades,vendors,currencies}';

    protected $description = 'Fill in missing translations for catalog master data (Business Types, Brands, Base Units, Product Grades, Vendors, Currencies), then resync their mirrored attribute options.';

    /**
     * key => [model class, translation model class, translation FK column,
     * attributes.master_source key this mirrors into — see
     * MasterAttributeOptionSync::SOURCES].
     *
     * @var array<string, array{0: class-string<Model>, 1: class-string<Model>, 2: string, 3: string}>
     */
    private const MASTERS = [
        'business_types' => [BusinessType::class, BusinessTypeTranslation::class, 'business_type_id', 'business_types'],
        'brands' => [Brand::class, BrandTranslation::class, 'brand_id', 'brands'],
        'base_units' => [BaseUnit::class, BaseUnitTranslation::class, 'base_unit_id', 'base_units'],
        'product_grades' => [ProductGrade::class, ProductGradeTranslation::class, 'product_grade_id', 'product_grades'],
        'vendors' => [Vendor::class, VendorTranslation::class, 'vendor_id', 'vendors'],
        'currencies' => [Currency::class, CurrencyTranslation::class, 'currency_id', 'currencies'],
    ];

    public function handle(AttributeAutoTranslator $translator, MasterAttributeOptionSync $sync): int
    {
        $enLocaleId = Locale::idForCode('en');

        $only = $this->option('only');
        $keys = $only ? array_intersect(array_keys(self::MASTERS), $only) : array_keys(self::MASTERS);

        if (empty($keys)) {
            $this->error('--only matched none of: '.implode(', ', array_keys(self::MASTERS)));

            return self::FAILURE;
        }

        $touchedSources = [];

        foreach ($keys as $key) {
            [$modelClass, $translationClass, $fk, $sourceKey] = self::MASTERS[$key];
            $this->info("=== {$key} ===");

            $filled = 0;
            $skipped = 0;

            /** @var \Illuminate\Database\Eloquent\Model $row */
            foreach ($modelClass::query()->with('translations')->orderBy('id')->get() as $row) {
                [$sourceLocaleId, $sourceLabel] = $this->resolveSource($row, $enLocaleId);
                if ($sourceLocaleId === null || $sourceLabel === '') {
                    $skipped++;

                    continue;
                }

                $translator->fillMissing($translationClass, $fk, $row->id, $sourceLocaleId, $sourceLabel);
                $filled++;
            }

            $this->line("  {$filled} row(s) processed, {$skipped} skipped (no label in any locale, including the raw name column).");

            if ($filled > 0) {
                $touchedSources[] = $sourceKey;
            }
        }

        if (empty($touchedSources)) {
            $this->info('Nothing to resync.');

            return self::SUCCESS;
        }

        $this->info('Resyncing mirrored attribute options...');
        foreach (Attribute::whereIn('master_source', $touchedSources)->get() as $attribute) {
            $sync->rebuildAttribute($attribute);
            $this->line("  resynced attribute '{$attribute->code}' (master_source={$attribute->master_source})");
        }

        $this->info('Done.');

        return self::SUCCESS;
    }

    /**
     * Same priority as *Controller::resolveAutoTranslateSource() /
     * TranslateMissingCategoryLabels::resolveSource() elsewhere in this
     * app: prefer the row's own `en` translation if one already exists
     * (real content, not derived from `name`), otherwise whichever locale
     * already has a non-empty translation, and only as an absolute last
     * resort — a row with literally no translation in any locale yet — the
     * raw `name` column, since at that point there's nothing else to go on
     * and it beats skipping the row entirely.
     *
     * @return array{0: int|null, 1: string}
     */
    private function resolveSource(Model $row, ?int $enLocaleId): array
    {
        if ($enLocaleId !== null) {
            $enLabel = trim((string) ($row->translations->firstWhere('locale_id', $enLocaleId)?->label ?? ''));
            if ($enLabel !== '') {
                return [$enLocaleId, $enLabel];
            }
        }

        foreach ($row->translations as $translation) {
            $label = trim((string) $translation->label);
            if ($label !== '') {
                return [(int) $translation->locale_id, $label];
            }
        }

        $rawName = trim((string) $row->name);
        if ($rawName !== '' && $enLocaleId !== null) {
            return [$enLocaleId, $rawName];
        }

        return [null, ''];
    }
}
