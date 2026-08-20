<?php

namespace App\Services\ImportExport\Importers;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\ImportConfig;
use App\Models\JobTracker;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\User;
use App\Jobs\AutoTranslateProductValueJob;
use App\Services\Catalog\AttributeAccessPolicy;
use App\Services\Catalog\ProductCategoryLinker;
use App\Services\ImportExport\RowImportException;

class ProductRowImporter implements RowImporterInterface
{
    public const FIXED_COLUMNS = ['sku', 'family_code', 'type', 'enabled'];

    private ?array $allowedAttributeCodesCache = null;

    /**
     * $user, when given, restricts columns()/importRow() to attributes this
     * user's role can *edit* (per AttributeAccessPolicy — both the
     * attribute itself and its Attribute Group, in every family it belongs
     * to) — null (the default) keeps every existing caller that doesn't
     * pass one unfiltered, matching the prior behavior.
     *
     * $jobTrackerId, when given, is the running import's own JobTracker row
     * — every AI-translate dispatch increments its total_translations_queued
     * counter, so the job status page can show live progress instead of
     * those translations running with no visibility at all.
     */
    public function __construct(
        private readonly ?User $user = null,
        private readonly ?int $jobTrackerId = null,
    ) {
    }

    /**
     * Every non-locale/non-channel attribute the given user is allowed to
     * edit (all of them, if no user was given).
     */
    public static function baseAttributeCodes(): array
    {
        return Attribute::where('is_locale_based', false)
            ->where('is_channel_based', false)
            ->orderBy('code')
            ->pluck('code')
            ->all();
    }

    /**
     * Only non-locale/non-channel attributes are supported for v1 — imported
     * values always land as the global (channel_id=null, locale_id=null) value.
     */
    public function columns(): array
    {
        return array_merge(self::FIXED_COLUMNS, $this->allowedAttributeCodes());
    }

    private function allowedAttributeCodes(): array
    {
        return $this->allowedAttributeCodesCache ??= app(AttributeAccessPolicy::class)
            ->filterAttributeCodes($this->user, self::baseAttributeCodes(), 'edit');
    }

    /**
     * The locale an imported value is treated as being written in, for AI
     * translation purposes — resolved from the import config's own
     * `source_locale` (an explicit admin choice, defaulting to Thai) rather
     * than config('app.locale') (which is 'en' here, just Laravel's
     * untouched framework default and unrelated to what language the
     * imported text is actually in).
     */
    private function sourceLocaleId(ImportConfig $config): ?int
    {
        return Locale::idForCode($config->source_locale) ?? Locale::idForCode('th');
    }

    /**
     * FIXED_COLUMNS use the same static lang/{locale}/import.php labels as
     * the other importers; the dynamic attribute columns use that
     * attribute's own translated label (same source Category/Attribute
     * pages already show), falling back to its raw `name` column, then to
     * the code itself, if no translation exists for the active locale.
     */
    public function columnLabels(): array
    {
        $labels = [];
        foreach (self::FIXED_COLUMNS as $column) {
            $label = __("import.columns.{$column}");
            $labels[$column] = $label === "import.columns.{$column}" ? $column : $label;
        }

        $attributeCodes = $this->allowedAttributeCodes();
        $attributesByCode = Attribute::whereIn('code', $attributeCodes)
            ->with('translations')
            ->get()
            ->keyBy('code');

        $localeId = Locale::idForCode(app()->getLocale());

        foreach ($attributeCodes as $code) {
            $attribute = $attributesByCode->get($code);
            if (!$attribute) {
                $labels[$code] = $code;
                continue;
            }

            $translation = $localeId ? $attribute->translations->firstWhere('locale_id', $localeId) : null;
            $labels[$code] = ($translation && trim((string) $translation->label) !== '')
                ? $translation->label
                : ($attribute->name ?: $code);
        }

        return $labels;
    }

    public function requiredColumns(): array
    {
        return ['sku'];
    }

    public function importRow(array $row, ImportConfig $config): array
    {
        $sku = trim((string) ($row['sku'] ?? ''));
        if ($sku === '') {
            throw new RowImportException('sku is required');
        }

        if ($config->action === 'delete') {
            $product = Product::where('sku', $sku)->first();
            if (!$product) {
                throw new RowImportException("Product with sku '{$sku}' not found");
            }
            ProductValue::where('product_id', $product->id)->delete();
            $product->delete();
            return [];
        }

        $familyCode = trim((string) ($row['family_code'] ?? ''));
        $family = null;
        if ($familyCode !== '') {
            $family = AttributeFamily::where('code', $familyCode)->first();
            if (!$family) {
                throw new RowImportException("Unknown family_code '{$familyCode}'");
            }
        }

        $type = strtolower(trim((string) ($row['type'] ?? 'simple')));
        if (!in_array($type, ['simple', 'configurable'], true)) {
            throw new RowImportException("type must be 'simple' or 'configurable'");
        }

        $enabledRaw = strtolower(trim((string) ($row['enabled'] ?? '1')));
        $enabled = in_array($enabledRaw, ['1', 'true', 'yes'], true);

        $product = Product::updateOrCreate(
            ['sku' => $sku],
            [
                'family_id' => $family?->id,
                'type' => $type,
                'enabled' => $enabled,
            ]
        );

        $unknownColumns = [];
        $restrictedColumns = [];
        $allowedAttributeCodes = $this->allowedAttributeCodes();
        // The permission check below only makes sense for attributes this
        // importer actually supports at all (non-locale/non-channel — see
        // baseAttributeCodes()/the v1-limitation note on columns()).
        // $allowedAttributeCodes never contains a locale/channel-based code
        // regardless of permissions, so checking a column like `pname`
        // against it would always fail and wrongly blame "no edit access"
        // instead of the real (pre-existing, unrelated) v1 limitation —
        // this keeps such columns landing in the global scope same as
        // before that permission check existed.
        $baseAttributeCodes = self::baseAttributeCodes();

        foreach ($row as $key => $value) {
            if (in_array($key, self::FIXED_COLUMNS, true) || $value === null || $value === '') {
                continue;
            }

            $attribute = Attribute::where('code', $key)->first();
            if (!$attribute) {
                $unknownColumns[] = $key;
                continue;
            }

            // Present in the file but outside what this import's user is
            // allowed to edit (see AttributeAccessPolicy) — skipped exactly
            // like an unknown column, just with a distinct warning so it
            // doesn't read as a typo.
            if ($this->user && in_array($key, $baseAttributeCodes, true) && !in_array($key, $allowedAttributeCodes, true)) {
                $restrictedColumns[] = $key;
                continue;
            }

            ProductValue::updateOrCreate(
                ['product_id' => $product->id, 'attribute_id' => $attribute->id, 'channel_id' => null, 'locale_id' => null],
                ['value' => (string) $value]
            );

            // Imported locale-based values always land in the untranslated/
            // global bucket above (see the class doc on baseAttributeCodes())
            // — with "AI translate" on, fan that value out to every other
            // enabled locale that doesn't already have one of its own, same
            // as ticking "AI translate" on an Attribute/Category label does.
            if ($config->ai_translate && $attribute->is_locale_based) {
                $sourceLocaleId = $this->sourceLocaleId($config);
                if ($sourceLocaleId !== null) {
                    AutoTranslateProductValueJob::dispatch($product->id, $attribute->id, $sourceLocaleId, (string) $value, $this->jobTrackerId);

                    if ($this->jobTrackerId) {
                        JobTracker::where('id', $this->jobTrackerId)->increment('total_translations_queued');
                    }
                }
            }
        }

        ProductCategoryLinker::linkFromCodes($product, [
            $row['pcatname'] ?? null,
            $row['psubcatname'] ?? null,
            $row['productgroupname'] ?? null,
        ]);

        $product->applySmartDefaults();

        $warnings = [];

        if (!empty($unknownColumns)) {
            $warnings[] = "Column(s) ignored, no matching attribute found: ".implode(', ', $unknownColumns);
        }

        if (!empty($restrictedColumns)) {
            $warnings[] = "Column(s) skipped, your role doesn't have edit access to: ".implode(', ', $restrictedColumns);
        }

        return $warnings;
    }
}
