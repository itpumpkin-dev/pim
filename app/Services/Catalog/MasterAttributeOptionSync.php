<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\BaseUnit;
use App\Models\Brand;
use App\Models\BusinessType;
use App\Models\Category;
use App\Models\CommissionGroup;
use App\Models\Currency;
use App\Models\Locale;
use App\Models\Point;
use App\Models\ProductType;
use App\Models\Vendor;
use Illuminate\Database\Eloquent\Model;

/**
 * A `select` attribute can declare a `master_source` (set on its edit page):
 * its option list then mirrors that master and is not hand-edited. This
 * service is the one place that mapping is resolved — the per-controller
 * MIRROR_ATTRIBUTE constants and the old hard-coded category depth table are
 * gone, replaced by `attributes.master_source`.
 *
 *   categories / subcategories / product_groups → depth 0 / 1 / 2 of the
 *       shared `categories` tree; option translations mirror CategoryTranslation
 *       plus the English name kept in additional_data.name_eng
 *   points / commission_groups / business_types / vendors / currencies /
 *   product_types → their own flat tables; plain admin_label only, no
 *       per-locale row
 *   base_units → its own flat table (base_units), but WITH per-locale rows
 *       (base_unit_translations) — mirrors CategoryTranslation's shape, not
 *       the single-admin_label flat masters above
 *
 * Master edits flow in through model events (categories) or the
 * SyncsAttributeOptionMirror trait (the flat masters); changing an
 * attribute's master_source, or `catalog:sync-master-options`, rebuilds the
 * whole option set from scratch.
 */
class MasterAttributeOptionSync
{
    /** source key => [label: i18n key (catalog ns), model: watched Eloquent class] */
    public const SOURCES = [
        'categories' => ['label' => 'masterSourceCategories', 'model' => Category::class],
        'subcategories' => ['label' => 'masterSourceSubcategories', 'model' => Category::class],
        'product_groups' => ['label' => 'masterSourceProductGroups', 'model' => Category::class],
        'points' => ['label' => 'masterSourcePoints', 'model' => Point::class],
        'commission_groups' => ['label' => 'masterSourceCommissionGroups', 'model' => CommissionGroup::class],
        'business_types' => ['label' => 'masterSourceBusinessTypes', 'model' => BusinessType::class],
        'vendors' => ['label' => 'masterSourceVendors', 'model' => Vendor::class],
        'currencies' => ['label' => 'masterSourceCurrencies', 'model' => Currency::class],
        'product_types' => ['label' => 'masterSourceProductTypes', 'model' => ProductType::class],
        'base_units' => ['label' => 'masterSourceBaseUnits', 'model' => BaseUnit::class],
        'brands' => ['label' => 'masterSourceBrands', 'model' => Brand::class],
    ];

    private const CATEGORY_DEPTH_KEYS = ['categories', 'subcategories', 'product_groups'];

    private ?int $englishLocaleId = null;
    private bool $englishLocaleResolved = false;

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(self::SOURCES);
    }

    /** @return array<int, array{value: string, labelKey: string}> for the attribute-edit picker */
    public static function pickerOptions(): array
    {
        return array_map(
            fn (string $key) => ['value' => $key, 'labelKey' => self::SOURCES[$key]['label']],
            self::keys(),
        );
    }

    // ── attribute side ──────────────────────────────────────────────────

    /** Wipe an attribute's options and regenerate them from its master_source. */
    public function rebuildAttribute(Attribute $attribute): void
    {
        AttributeOption::where('attribute_id', $attribute->id)->get()->each->delete();

        $key = $attribute->master_source;
        if ($key === null || ! isset(self::SOURCES[$key])) {
            return;
        }

        foreach ($this->rowsFor($key) as $row) {
            $this->upsertOption($attribute->id, $row);
        }
    }

    /** Rebuild every attribute that has a master_source. Returns the count. */
    public function rebuildAll(): int
    {
        $count = 0;
        Attribute::whereNotNull('master_source')->get()->each(function (Attribute $attribute) use (&$count) {
            $this->rebuildAttribute($attribute);
            $count++;
        });

        return $count;
    }

    // ── master side ─────────────────────────────────────────────────────

    /** One master row was saved — upsert its option on every attribute bound to it. */
    public function syncModel(Model $model): void
    {
        foreach ($this->sourceKeysFor($model) as $key) {
            $attributeIds = Attribute::where('master_source', $key)->pluck('id');
            if ($attributeIds->isEmpty()) {
                continue;
            }

            $oldCode = $this->normaliseCode($this->previousCodeFor($key, $model));
            $row = $this->rowForModel($key, $model);
            $newCode = $row !== null ? $this->normaliseCode($row['code']) : null;

            foreach ($attributeIds as $attributeId) {
                if ($oldCode !== null && $oldCode !== $newCode) {
                    AttributeOption::where('attribute_id', $attributeId)->where('code', $oldCode)->get()->each->delete();
                }
                if ($row !== null) {
                    $this->upsertOption($attributeId, $row);
                }
            }
        }
    }

    /** One master row was deleted — drop its option everywhere. */
    public function forgetModel(Model $model): void
    {
        foreach ($this->sourceKeysFor($model) as $key) {
            $row = $this->rowForModel($key, $model);
            if ($row === null) {
                continue;
            }
            $code = $this->normaliseCode($row['code']);
            foreach (Attribute::where('master_source', $key)->pluck('id') as $attributeId) {
                AttributeOption::where('attribute_id', $attributeId)->where('code', $code)->get()->each->delete();
            }
        }
    }

    // ── option writer ──────────────────────────────────────────────────

    /**
     * @param  array{code: string, label: ?string, is_active?: bool, translations?: array<int, string>}  $row
     */
    private function normaliseCode(?string $code): ?string
    {
        $code = strtolower(trim((string) $code));

        return $code === '' ? null : $code;
    }

    private function upsertOption(int $attributeId, array $row): void
    {
        $code = $this->normaliseCode($row['code']);
        if ($code === null) {
            return;
        }

        $option = AttributeOption::firstOrNew(['attribute_id' => $attributeId, 'code' => $code]);
        $option->admin_label = trim((string) ($row['label'] ?? '')) ?: $code;
        if (array_key_exists('is_active', $row)) {
            $option->is_active = (bool) $row['is_active'];
        }
        $option->save();

        $kept = [];
        foreach (($row['translations'] ?? []) as $localeId => $label) {
            if (trim((string) $label) === '') {
                continue;
            }
            AttributeOptionTranslation::updateOrCreate(
                ['attribute_option_id' => $option->id, 'locale_id' => $localeId],
                ['label' => $label],
            );
            $kept[] = $localeId;
        }
        AttributeOptionTranslation::where('attribute_option_id', $option->id)
            ->when($kept, fn ($q) => $q->whereNotIn('locale_id', $kept))
            ->delete();
    }

    // ── row extraction ────────────────────────────────────────────────

    /**
     * Every option row for a source.
     *
     * @return array<int, array{code: string, label: ?string, is_active?: bool, translations?: array<int, string>}>
     */
    private function rowsFor(string $key): array
    {
        if (in_array($key, self::CATEGORY_DEPTH_KEYS, true)) {
            $rows = [];
            Category::query()->with('translations')->chunkById(500, function ($categories) use ($key, &$rows) {
                foreach ($categories as $category) {
                    if ($this->categoryDepthKey($category) === $key) {
                        $rows[] = $this->categoryRow($category);
                    }
                }
            });

            return $rows;
        }

        return match ($key) {
            'points' => Point::all()->map(fn (Point $p) => [
                'code' => (string) $p->point_type, 'label' => (string) $p->point_type, 'is_active' => (bool) $p->is_active,
            ])->all(),
            'commission_groups' => CommissionGroup::all()->map(fn (CommissionGroup $g) => [
                'code' => (string) $g->code, 'label' => $g->p_group_name ?? $g->code, 'is_active' => (bool) $g->is_active,
            ])->all(),
            'business_types' => BusinessType::with('translations')->get()->map(fn (BusinessType $b) => $this->businessTypeRow($b))->all(),
            'vendors' => Vendor::with('translations')->get()->map(fn (Vendor $v) => $this->vendorRow($v))->all(),
            'currencies' => Currency::with('translations')->get()->map(fn (Currency $c) => $this->currencyRow($c))->all(),
            'product_types' => ProductType::with('translations')->get()->map(fn (ProductType $p) => $this->productTypeRow($p))->all(),
            'base_units' => BaseUnit::with('translations')->get()->map(fn (BaseUnit $u) => $this->baseUnitRow($u))->all(),
            'brands' => Brand::with('translations')->get()->map(fn (Brand $b) => $this->brandRow($b))->all(),
            default => [],
        };
    }

    /**
     * One option row for a single master model (or null if it doesn't apply
     * to this source — e.g. a category at the wrong depth).
     *
     * @return array{code: string, label: ?string, is_active?: bool, translations?: array<int, string>}|null
     */
    private function rowForModel(string $key, Model $model): ?array
    {
        if ($model instanceof Category) {
            return $this->categoryDepthKey($model) === $key ? $this->categoryRow($model) : null;
        }
        if ($model instanceof Point) {
            return ['code' => (string) $model->point_type, 'label' => (string) $model->point_type, 'is_active' => (bool) $model->is_active];
        }
        if ($model instanceof CommissionGroup) {
            return ['code' => (string) $model->code, 'label' => $model->p_group_name ?? $model->code, 'is_active' => (bool) $model->is_active];
        }
        if ($model instanceof BusinessType) {
            return $this->businessTypeRow($model);
        }
        if ($model instanceof Vendor) {
            return $this->vendorRow($model);
        }
        if ($model instanceof Currency) {
            return $this->currencyRow($model);
        }
        if ($model instanceof ProductType) {
            return $this->productTypeRow($model);
        }
        if ($model instanceof BaseUnit) {
            return $this->baseUnitRow($model);
        }
        if ($model instanceof Brand) {
            return $this->brandRow($model);
        }

        return null;
    }

    /** @return array{code: string, label: string, is_active: bool, translations: array<int, string>} */
    private function baseUnitRow(BaseUnit $unit): array
    {
        return [
            'code' => (string) $unit->code,
            'label' => $unit->name,
            'is_active' => (bool) $unit->is_active,
            'translations' => $this->translationsMap($unit),
        ];
    }

    /**
     * @return array{code: string, label: string, is_active: bool, translations: array<int, string>}
     *
     * เอาเฉพาะ code/name/is_active/translations มา mirror เป็นตัวเลือกของ
     * pbrand attribute เท่านั้น — thumbnail/parent_id/marketplace brand id ไม่
     * เกี่ยวกับ "ตัวเลือกใน select field" เลย (เป็นข้อมูลเฉพาะทางของแบรนด์เอง ที่
     * BrandController/ResolvesProductAttributeValues อ่านตรงจากตาราง brands
     * โดยไม่ผ่าน AttributeOption อีกต่อไป) เลยไม่ต้องขยาย row shape ให้ซับซ้อน
     * เกินจำเป็น
     */
    private function brandRow(Brand $brand): array
    {
        return [
            'code' => (string) $brand->code,
            'label' => $brand->name,
            'is_active' => (bool) $brand->is_active,
            'translations' => $this->translationsMap($brand),
        ];
    }

    /** @return array{code: string, label: string, is_active: bool, translations: array<int, string>} */
    private function businessTypeRow(BusinessType $businessType): array
    {
        return [
            'code' => (string) $businessType->code,
            'label' => $businessType->name,
            'is_active' => (bool) $businessType->is_active,
            'translations' => $this->translationsMap($businessType),
        ];
    }

    /** @return array{code: string, label: string, is_active: bool, translations: array<int, string>} */
    private function currencyRow(Currency $currency): array
    {
        return [
            'code' => strtolower((string) $currency->code),
            'label' => $currency->name,
            'is_active' => true,
            'translations' => $this->translationsMap($currency),
        ];
    }

    /** @return array{code: string, label: string, is_active: bool, translations: array<int, string>} */
    private function productTypeRow(ProductType $productType): array
    {
        return [
            'code' => (string) $productType->code,
            'label' => $productType->name,
            'is_active' => (bool) $productType->is_active,
            'translations' => $this->translationsMap($productType),
        ];
    }

    /** @return array{code: string, label: string, is_active: bool, translations: array<int, string>} */
    private function vendorRow(Vendor $vendor): array
    {
        return [
            'code' => (string) $vendor->code,
            'label' => $vendor->name,
            'is_active' => (bool) $vendor->is_active,
            'translations' => $this->translationsMap($vendor),
        ];
    }

    /**
     * ดึง translations relation ของโมเดลใดก็ได้ที่มี HasMany ชื่อ `translations`
     * (BusinessType/Currency/ProductType/BaseUnit/Brand ทุกตัวมี) ออกมาเป็น
     * map ธรรมดา locale_id => label ใช้ร่วมกันแทนที่จะเขียนซ้ำในแต่ละ *Row()
     *
     * @param  Model&object{translations: \Illuminate\Database\Eloquent\Collection}  $model
     * @return array<int, string>
     */
    private function translationsMap(Model $model): array
    {
        $translations = [];
        $rows = $model->relationLoaded('translations') ? $model->translations : $model->translations()->get();
        foreach ($rows as $t) {
            if (trim((string) $t->label) !== '') {
                $translations[$t->locale_id] = $t->label;
            }
        }

        return $translations;
    }

    /** @return array{code: string, label: string, is_active: bool, translations: array<int, string>} */
    private function categoryRow(Category $category): array
    {
        $rawName = $category->getAttributes()['name'] ?? $category->getRawOriginal('name');
        $label = trim((string) $rawName);

        $translations = [];
        $engName = trim((string) ($category->additional_data['name_eng'] ?? ''));
        if ($engName !== '' && ($enId = $this->englishLocaleId()) !== null) {
            $translations[$enId] = $engName;
        }
        $rows = $category->relationLoaded('translations') ? $category->translations : $category->translations()->get();
        foreach ($rows as $t) {
            if (trim((string) $t->label) !== '') {
                $translations[$t->locale_id] = $t->label;
            }
        }

        return [
            'code' => (string) $category->code,
            'label' => $label !== '' ? $label : (string) $category->code,
            'is_active' => (bool) $category->is_active,
            'translations' => $translations,
        ];
    }

    // ── helpers ───────────────────────────────────────────────────────

    /** @return array<int, string> source keys whose watched model is this instance's class */
    private function sourceKeysFor(Model $model): array
    {
        $class = get_class($model);

        return array_keys(array_filter(self::SOURCES, fn (array $s) => $s['model'] === $class));
    }

    /** 'categories' | 'subcategories' | 'product_groups' | null (deeper) */
    private function categoryDepthKey(Category $category): ?string
    {
        $depth = 0;
        $parentId = $category->parent_id;
        while ($parentId !== null && $depth < 3) {
            $depth++;
            $parentId = Category::where('id', $parentId)->value('parent_id');
        }

        return self::CATEGORY_DEPTH_KEYS[$depth] ?? null;
    }

    /** The option code this model used *before* the current save, if its key column changed. */
    private function previousCodeFor(string $key, Model $model): ?string
    {
        if ($model instanceof Category) {
            return null; // category `code` is immutable after creation
        }
        if ($model instanceof Point) {
            return $model->wasChanged('point_type') ? (string) $model->getOriginal('point_type') : null;
        }
        if ($model instanceof Currency) {
            return $model->wasChanged('code') ? strtolower((string) $model->getOriginal('code')) : null;
        }
        if ($model instanceof CommissionGroup || $model instanceof BusinessType || $model instanceof Vendor || $model instanceof ProductType || $model instanceof BaseUnit || $model instanceof Brand) {
            return $model->wasChanged('code') ? (string) $model->getOriginal('code') : null;
        }

        return null;
    }

    private function englishLocaleId(): ?int
    {
        if (! $this->englishLocaleResolved) {
            $this->englishLocaleId = Locale::idForCode('en');
            $this->englishLocaleResolved = true;
        }

        return $this->englishLocaleId;
    }
}
