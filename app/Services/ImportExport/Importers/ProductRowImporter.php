<?php

namespace App\Services\ImportExport\Importers;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\ImportConfig;
use App\Models\JobTracker;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\User;
use App\Jobs\AutoTranslateProductValueJob;
use App\Services\Catalog\AttributeAccessPolicy;
use App\Services\Catalog\EffectiveFamilyAttributeResolver;
use App\Services\Catalog\ProductCategoryLinker;
use App\Services\ImportExport\RowImportException;

class ProductRowImporter implements RowImporterInterface
{
    // ไม่มี 'family_code' ในนี้ตั้งใจ — ไม่ตั้ง family_id จาก import อีกต่อไป
    // (ดู docblock ของ importRow() ตรง Product::updateOrCreate())
    public const FIXED_COLUMNS = ['sku', 'type', 'enabled'];

    // attribute ระบบที่ importRow() ใช้ผูกสินค้าเข้าต้นไม้หมวดหมู่ (ดู
    // ProductCategoryLinker::linkFromCodes()) — ไม่เคยอยู่ใน family ไหน เลยต้อง
    // เสนอเป็นคอลัมน์เองเสมอ ไม่งั้นพอ import แบบจำกัดตามตระกูล คอลัมน์ที่
    // ทำให้สินค้าได้ตระกูลนั้นจริงๆ กลับหายไปจากไฟล์ตัวอย่าง
    public const CATEGORY_COLUMNS = ['pcatname', 'psubcatname', 'productgroupname'];

    private ?array $allowedAttributeCodesCache = null;

    private ?array $editableAttributeCodesCache = null;

    /** null = not resolved yet; false = no family scoping; array = the family's importable codes, in family order. */
    private array|false|null $familyAttributeCodesCache = null;

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
     *
     * $familyCode is a single Attribute Family code, or a comma-separated
     * list of several (see familyAttributeCodes()) — the wizard resolves
     * these from the Category/Subcategory/Product Group the user picks,
     * since one Product Group can bind more than one family.
     */
    public function __construct(
        private readonly ?User $user = null,
        private readonly ?int $jobTrackerId = null,
        private readonly ?string $familyCode = null,
    ) {
    }

    /**
     * When the import is scoped to one or more Attribute Families (the
     * wizard's category picker can resolve several families for one Product
     * Group — see ImportConfigController::categoryAttributeFamilies()),
     * the union of those families' attributes this importer can actually
     * handle (see importableAttributeCodes()), in the order the families
     * lay them out (listed family order, then family_attributes.sort_order —
     * same order the product edit page shows them in). Returns null when no
     * family was chosen, meaning "don't narrow the column set at all".
     * $familyCode holds a single code or a comma-separated list.
     *
     * @return array<int, string>|null
     */
    private function familyAttributeCodes(): ?array
    {
        if ($this->familyAttributeCodesCache === null) {
            $codes = array_values(array_filter(array_map('trim', explode(',', (string) $this->familyCode))));
            if ($codes === []) {
                $this->familyAttributeCodesCache = false;
            } else {
                $familyIds = AttributeFamily::whereIn('code', $codes)->pluck('id', 'code');
                $attributeCodes = [];
                foreach ($codes as $code) {
                    if (!$familyIds->has($code)) {
                        continue;
                    }
                    array_push($attributeCodes, ...FamilyAttribute::where('family_id', $familyIds[$code])
                        ->join('attributes', 'attributes.id', '=', 'family_attributes.attribute_id')
                        ->orderBy('family_attributes.sort_order')
                        ->orderBy('family_attributes.id')
                        ->pluck('attributes.code')
                        ->all());
                }
                $importable = array_flip(self::importableAttributeCodes());
                $this->familyAttributeCodesCache = array_values(array_filter(
                    array_unique($attributeCodes),
                    fn (string $code) => isset($importable[$code])
                ));
            }
        }

        return $this->familyAttributeCodesCache === false ? null : $this->familyAttributeCodesCache;
    }

    /**
     * Every non-locale/non-channel attribute — what the product *exporter*
     * writes (it reads the global locale_id=null scope only). Not the
     * importer's own column list anymore: see importableAttributeCodes().
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
     * Every attribute this importer can write: all but channel-based ones.
     * Locale-based values (which is nearly every attribute here) land in the
     * global scope (locale_id = null) — the product edit page and every read
     * path fall back to that scope for any locale with no value of its own,
     * and "AI translate" fans it out to the other locales. Only listing
     * non-locale attributes (the old v1 rule) left the sample/review step
     * with just sku/type/enabled even though importRow() always accepted
     * these columns anyway.
     */
    public static function importableAttributeCodes(): array
    {
        return Attribute::where('is_channel_based', false)
            ->orderBy('code')
            ->pluck('code')
            ->all();
    }

    public function columns(): array
    {
        return array_merge(self::FIXED_COLUMNS, $this->allowedAttributeCodes());
    }

    /**
     * Importable attributes this import's user may edit — the permission
     * gate importRow() enforces, independent of any family narrowing (a
     * file can carry attributes outside the chosen families, e.g. a product
     * group's own family, and those still import).
     */
    private function editableAttributeCodes(): array
    {
        return $this->editableAttributeCodesCache ??= app(AttributeAccessPolicy::class)
            ->filterAttributeCodes($this->user, self::importableAttributeCodes(), 'edit');
    }

    /**
     * The column set offered for this import (sample file, review step,
     * header-label mapping): the category columns first, then either every
     * editable attribute or — when scoped to families — just theirs.
     */
    private function allowedAttributeCodes(): array
    {
        if ($this->allowedAttributeCodesCache === null) {
            $editable = $this->editableAttributeCodes();

            $familyCodes = $this->familyAttributeCodes();
            $codes = $familyCodes !== null
                ? array_values(array_intersect($familyCodes, $editable))
                : $editable;

            $categoryCodes = array_values(array_intersect(self::CATEGORY_COLUMNS, $editable));

            $this->allowedAttributeCodesCache = array_values(array_unique(array_merge($categoryCodes, $codes)));
        }

        return $this->allowedAttributeCodesCache;
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
        $required = ['sku'];

        // With a family chosen in the wizard, surface that family's required
        // attributes too (limited to ones this import can actually write —
        // see allowedAttributeCodes()) so the review step lists every column
        // the file must carry a value for, not just the SKU.
        $familyCodes = $this->familyAttributeCodes();
        if ($familyCodes !== null) {
            $allowed = $this->allowedAttributeCodes();
            $requiredFamilyCodes = Attribute::whereIn('code', array_intersect($familyCodes, $allowed))
                ->where('is_required', true)
                ->pluck('code')
                ->all();
            $required = array_values(array_merge($required, $requiredFamilyCodes));
        }

        return $required;
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

        $type = strtolower(trim((string) ($row['type'] ?? 'simple')));
        if (!in_array($type, ['simple', 'configurable'], true)) {
            throw new RowImportException("type must be 'simple' or 'configurable'");
        }

        $enabledRaw = strtolower(trim((string) ($row['enabled'] ?? '1')));
        $enabled = in_array($enabledRaw, ['1', 'true', 'yes'], true);

        // ไม่ตั้ง family_id จาก import อีกต่อไป (ตัดตามที่ user ขอ) — ให้ตรงกับหน้า
        // Create/Edit ที่ไม่มี family picker ให้เลือกตรงๆ มาตั้งแต่ตัด family_id/
        // category_id ออกจากฟอร์มไปแล้ว ตระกูลแอตทริบิวต์ที่ "มีผลจริง" คำนวณจาก
        // pcatname/psubcatname/productgroupname ด้านล่าง (ผ่าน ProductCategoryLinker
        // ผูกเข้าต้นไม้ categories) แทน — ดู ProductController::effectiveFamilyIds()
        // ซึ่งไม่ fallback ไปที่ family_id เดิมอีกต่อไปแล้วเช่นกัน ตั้งค่านี้ตรงๆ
        // ที่นี่จะโดนเพิกเฉยเงียบๆ ถ้าหมวดหมู่ที่ผูกไว้ยังไม่มีตระกูลผูกอยู่ ทำให้
        // สินค้าที่ import มาไม่เห็น attribute field ไหนเลยในหน้า Edit อย่างงงๆ
        $product = Product::updateOrCreate(
            ['sku' => $sku],
            [
                'type' => $type,
                'enabled' => $enabled,
            ]
        );

        // ต้องผูกหมวดหมู่ "ก่อน" คำนวณ effectiveFamilyIds() ด้านล่าง — ตระกูลที่
        // มีผลจริงมาจาก product_category → category_attribute_family ล้วนๆ ถ้า
        // ผูกทีหลัง (แบบเดิม) SKU ใหม่ที่ import รอบแรกจะยังไม่มีหมวดหมู่ตอนหา
        // group เลยได้ attribute_group_id = NULL ทุกแถว ไม่โผล่ใน panel ของ group
        // ไหนในหน้า Edit เลย ต้อง import ซ้ำอีกรอบถึงจะเข้า group ถูก (และทิ้งแถว
        // NULL ค้างไว้เป็นแถวซ้ำ)
        $categoryCodes = array_values(array_unique(array_filter(
            [$row['pcatname'] ?? null, $row['psubcatname'] ?? null, $row['productgroupname'] ?? null],
            fn ($code) => is_string($code) && $code !== ''
        )));
        ProductCategoryLinker::linkFromCodes($product, $categoryCodes);

        // linkFromCodes() ข้าม code ที่ไม่มีใน categories แบบเงียบๆ — แจ้งเป็น
        // warning ของแถวนั้นแทน ไม่งั้นพิมพ์ code ผิด (เช่น ตัวพิมพ์ใหญ่ หรือมี
        // ช่องว่าง) สินค้าจะไม่ได้หมวดหมู่/ตระกูลโดยไม่มีใครรู้ตัว
        $unmatchedCategoryCodes = array_values(array_diff(
            $categoryCodes,
            $categoryCodes === [] ? [] : Category::whereIn('code', $categoryCodes)->pluck('code')->all()
        ));

        $unknownColumns = [];
        $restrictedColumns = [];
        // ตั้งแต่ 1 attribute อยู่ได้หลาย attribute_group_id พร้อมกัน (ดู
        // migration 2026_09_23_000001_add_attribute_group_id_to_product_values_table)
        // updateOrCreate() ด้านล่างต้องระบุ attribute_group_id ที่แน่นอนด้วย ไม่งั้น
        // ถ้า attribute นั้นมีมากกว่า 1 แถวอยู่แล้ว (คนละ group) จะไปจับคู่แถวไหน
        // มาอัปเดตก็ได้แบบสุ่ม (nondeterministic write, ไม่ใช่แค่อ่านค่าเก่าผิด) —
        // import ยังไม่รองรับคอลัมน์แยกตาม group (v1) เลยเลือก "ตำแหน่งหลัก" แบบ
        // เดียวกับทุกจุดที่ยังไม่ group-aware (ดู primaryGroupIdFor())
        $familyAttributeResolver = app(EffectiveFamilyAttributeResolver::class);
        $effectiveFamilyIds = $familyAttributeResolver->effectiveFamilyIds($product);
        // The permission check below covers every attribute this importer
        // lists (see importableAttributeCodes()) — checked against the
        // permission-only set, never the family-narrowed column set, so a
        // column outside the wizard's chosen families isn't wrongly blamed
        // as "no edit access". Channel-based attributes aren't listed and
        // keep landing in the global scope as before.
        $importableAttributeCodes = array_flip(self::importableAttributeCodes());
        $editableAttributeCodes = array_flip($this->editableAttributeCodes());

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
            if ($this->user && isset($importableAttributeCodes[$key]) && !isset($editableAttributeCodes[$key])) {
                $restrictedColumns[] = $key;
                continue;
            }

            $groupId = $familyAttributeResolver->primaryGroupIdFor($attribute->id, $effectiveFamilyIds);

            ProductValue::updateOrCreate(
                ['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupId, 'channel_id' => null, 'locale_id' => null],
                ['value' => (string) $value]
            );

            // Imported locale-based values always land in the untranslated/
            // global bucket above (see importableAttributeCodes())
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

        $product->applySmartDefaults();

        $warnings = [];

        if (!empty($unmatchedCategoryCodes)) {
            $warnings[] = 'Category code(s) not found, product not linked to them: '.implode(', ', $unmatchedCategoryCodes);
        }

        if (empty($effectiveFamilyIds)) {
            $warnings[] = "No Attribute Family resolved for this product (none of its categories is bound to one) — values were saved without an attribute group and won't show in the product edit page's group panels. Check pcatname/psubcatname/productgroupname.";
        }

        if (!empty($unknownColumns)) {
            $warnings[] = "Column(s) ignored, no matching attribute found: ".implode(', ', $unknownColumns);
        }

        if (!empty($restrictedColumns)) {
            $warnings[] = "Column(s) skipped, your role doesn't have edit access to: ".implode(', ', $restrictedColumns);
        }

        return $warnings;
    }
}
