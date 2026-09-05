<?php

namespace App\Http\Controllers;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\BaseUnit;
use App\Models\Brand;
use App\Models\BusinessType;
use App\Models\Category;
use App\Models\CommissionGroup;
use App\Models\Currency;
use App\Models\Department;
use App\Models\JobPosition;
use App\Models\Locale;
use App\Models\Point;
use App\Models\Product;
use App\Models\ProductGrade;
use App\Models\ProductValue;
use App\Models\Role;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Backs the Fiori "Shell Search" object suggestions (resources/js/components/
 * shell-search.tsx) — the shell bar's search field is always visible, but
 * each result group below only appears for a viewer who actually holds the
 * matching `list_*` permission (mirrors how the sidebar itself hides whole
 * sections). "App suggestions" (jumping straight to a menu page) are matched
 * client-side against the same nav tree the sidebar renders — see
 * resources/js/hooks/use-nav-items.ts — so this endpoint only has to cover
 * "Object suggestions": live records the viewer can search for.
 */
class GlobalSearchController extends Controller
{
    private const LIMIT = 5;

    private const EMPTY_RESULT = [
        'products' => [],
        'categories' => [],
        'subcategories' => [],
        'productGroups' => [],
        'brands' => [],
        'baseUnits' => [],
        'businessTypes' => [],
        'productGrades' => [],
        'vendors' => [],
        'currencies' => [],
        'points' => [],
        'commissionGroups' => [],
        'attributes' => [],
        'attributeGroups' => [],
        'attributeFamilies' => [],
        'users' => [],
        'roles' => [],
        'departments' => [],
        'jobPositions' => [],
    ];

    /**
     * Builds a safe ILIKE '%...%' pattern for a raw user-typed search term.
     * Escapes the LIKE metacharacters (`%`, `_`, and the escape char itself)
     * so a query like "ABC_123" matches that literal substring instead of
     * "_" wildcarding any single character (and "%" wildcarding any run of
     * characters).
     */
    private static function likePattern(string $query): string
    {
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $query);

        return "%{$escaped}%";
    }

    public function search(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        $user = $request->user();

        // ต่ำกว่า 2 ตัวอักษรผลลัพธ์จะกว้างเกินไปจนไม่มีประโยชน์ (แถมยังเป็น query
        // ที่แพงที่สุดด้วย เพราะ LIKE '%x%' ใช้ index ไม่ได้) — เหมือนเงื่อนไขเดียวกับ
        // ที่ ProductPicker (resources/js/components/product-picker.tsx) ใช้ฝั่ง
        // client อยู่แล้วสำหรับ picker อื่นๆ ในระบบ
        if ($query === '' || mb_strlen($query) < 2 || ! $user) {
            return response()->json(self::EMPTY_RESULT);
        }

        $result = self::EMPTY_RESULT;

        if ($user->hasPermission('products', 'list_products')) {
            $result['products'] = $this->searchProducts($query);
        }
        if ($user->hasPermission('categories', 'list_categories')) {
            $result['categories'] = $this->searchCategoryLevel($query, 0);
        }
        if ($user->hasPermission('subcategories', 'list_subcategories')) {
            $result['subcategories'] = $this->searchCategoryLevel($query, 1);
        }
        if ($user->hasPermission('product_groups', 'list_product_groups')) {
            $result['productGroups'] = $this->searchCategoryLevel($query, 2);
        }
        if ($user->hasPermission('brands', 'list_brands')) {
            $result['brands'] = $this->searchMaster(Brand::class, $query, '/catalog/brands', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('base_units', 'list_base_units')) {
            $result['baseUnits'] = $this->searchMaster(BaseUnit::class, $query, '/catalog/base-units', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('business_types', 'list_business_types')) {
            $result['businessTypes'] = $this->searchMaster(BusinessType::class, $query, '/catalog/business-types', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('product_grades', 'list_product_grades')) {
            $result['productGrades'] = $this->searchMaster(ProductGrade::class, $query, '/catalog/product-grades', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('vendors', 'list_vendors')) {
            $result['vendors'] = $this->searchMaster(Vendor::class, $query, '/catalog/vendors', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('currencies', 'list_currencies')) {
            $result['currencies'] = $this->searchMaster(Currency::class, $query, '/catalog/currencies', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('points', 'list_points')) {
            // ไม่มีคอลัมน์ code/name — ตัว "จุดที่ระบุตัวตน" ของ record นี้คือ
            // point_type เพียงอย่างเดียว (ดู Point model)
            $result['points'] = $this->searchMaster(Point::class, $query, '/catalog/points', ['point_type'], 'point_type', null, false);
        }
        if ($user->hasPermission('commission_groups', 'list_commission_groups')) {
            $result['commissionGroups'] = $this->searchMaster(CommissionGroup::class, $query, '/catalog/commission-groups', ['code', 'p_group_name'], 'p_group_name', 'code', false);
        }
        if ($user->hasPermission('attributes', 'list_attributes')) {
            $result['attributes'] = $this->searchMaster(Attribute::class, $query, '/catalog/attributes', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('attribute_groups', 'list_attribute_groups')) {
            $result['attributeGroups'] = $this->searchMaster(AttributeGroup::class, $query, '/catalog/attributeGroups', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('attribute_families', 'list_attribute_families')) {
            $result['attributeFamilies'] = $this->searchMaster(AttributeFamily::class, $query, '/catalog/attributeFamilies', ['name', 'code'], 'name', 'code', true);
        }
        if ($user->hasPermission('users', 'list_users')) {
            $result['users'] = $this->searchUsers($query);
        }
        if ($user->hasPermission('roles', 'list_roles')) {
            $result['roles'] = $this->searchMaster(Role::class, $query, '/system/roles', ['label'], 'label', null, false);
        }
        if ($user->hasPermission('departments', 'list_departments')) {
            $result['departments'] = $this->searchMaster(Department::class, $query, '/system/department', ['name'], 'name', null, false);
        }
        if ($user->hasPermission('job_positions', 'list_job_positions')) {
            $result['jobPositions'] = $this->searchMaster(JobPosition::class, $query, '/system/jobPosition', ['name'], 'name', null, false);
        }

        return response()->json($result);
    }

    /**
     * เหมือน ProductController::search() (SKU ตรงๆ + ชื่อ `pname` ในทุกภาษา)
     * แต่ไม่ผูกกับ context ของหน้า Associations (ไม่มี exclude/raw-material-only)
     * และเลือกมาแค่ locale ปัจจุบันของแอดมิน (fallback ไปแถวแบบ global) พอสำหรับ
     * โชว์เป็น suggestion — ไม่ต้อง resolve ให้ครบทุก locale เหมือนหน้า Edit
     */
    private function searchProducts(string $query): Collection
    {
        $nameAttributeId = Attribute::idForCode('pname');

        $matchingProductIds = $nameAttributeId
            ? ProductValue::where('attribute_id', $nameAttributeId)->where('value', 'ilike', self::likePattern($query))->pluck('product_id')
            : collect();

        $products = Product::where(function (Builder $q) use ($query, $matchingProductIds) {
            $q->where('sku', 'ilike', self::likePattern($query));
            if ($matchingProductIds->isNotEmpty()) {
                $q->orWhereIn('id', $matchingProductIds);
            }
        })
            ->limit(self::LIMIT)
            ->get(['id', 'sku']);

        if ($products->isEmpty()) {
            return collect();
        }

        $activeLocaleId = Locale::idForCode(app()->getLocale());
        $namesByProduct = ProductValue::whereIn('product_id', $products->pluck('id'))
            ->where('attribute_id', $nameAttributeId)
            ->whereNull('channel_id')
            ->get(['product_id', 'locale_id', 'value'])
            ->groupBy('product_id');

        return $products->map(function (Product $product) use ($namesByProduct, $activeLocaleId) {
            $rows = $namesByProduct->get($product->id);
            $match = $rows && $activeLocaleId ? $rows->firstWhere('locale_id', $activeLocaleId) : null;
            $name = ($match ?? $rows?->firstWhere('locale_id', null))?->value;

            return [
                'id' => $product->id,
                'label' => $product->sku,
                'sub' => ($name && $name !== $product->sku) ? $name : null,
                'url' => "/catalog/products/{$product->id}/edit",
            ];
        })->values();
    }

    /**
     * หมวดหมู่/หมวดหมู่ย่อย/กลุ่มสินค้าอยู่ในตาราง `categories` ตารางเดียวกัน
     * (ดู Category model) แยกกันแค่ระดับความลึกของ parent_id — depth 0 คือ
     * หมวดหมู่หลัก (ไม่มี parent), depth 1 คือ parent เป็นหมวดหมู่หลัก, depth 2
     * คือ parent มี parent ของตัวเองอีกที (ต้นไม้นี้ลึกแค่ 3 ชั้นเสมอ ดู
     * ProductController::MASTER_CATEGORY_ATTRIBUTE_CODES) — แต่ละ depth มีหน้า
     * list/edit แยกกันจริงๆ (categories / subcategories / product-groups)
     * เลยต้องแยก query และ URL ปลายทางตาม depth ให้ตรง
     */
    private function searchCategoryLevel(string $query, int $depth): Collection
    {
        [$editPrefix, $with] = match ($depth) {
            0 => ['/catalog/categories', []],
            1 => ['/catalog/subcategories', ['parent']],
            default => ['/catalog/product-groups', ['parent.parent']],
        };

        $categories = Category::query()
            ->with($with)
            ->when($depth === 0, fn (Builder $q) => $q->whereNull('parent_id'))
            ->when($depth === 1, fn (Builder $q) => $q->whereHas('parent', fn (Builder $p) => $p->whereNull('parent_id')))
            ->when($depth === 2, fn (Builder $q) => $q->whereHas('parent', fn (Builder $p) => $p->whereNotNull('parent_id')))
            ->where(fn (Builder $q) => $q->where('name', 'ilike', self::likePattern($query))
                ->orWhere('code', 'ilike', self::likePattern($query))
                // ค้นเจอได้ทั้งภาษาที่ raw `name` เก็บไว้ (ปกติคือไทย) และคำแปลใน
                // ภาษาอื่นๆ ทุกภาษา (ไม่ใช่แค่ locale ปัจจุบัน) — ไม่งั้นพิมพ์ชื่อ
                // ภาษาอังกฤษของหมวดหมู่ที่ raw name เป็นไทยจะหาไม่เจอเลย ทั้งที่
                // label ที่โชว์จริงตอนนี้ resolve ตาม locale แล้ว (ดู
                // ->without('translations') ที่เอาออกไปแล้วด้านบน)
                ->orWhereHas('translations', fn (Builder $t) => $t->where('label', 'ilike', self::likePattern($query))))
            ->limit(self::LIMIT)
            ->get(['id', 'parent_id', 'code', 'name']);

        return $categories->map(function (Category $category) use ($editPrefix, $depth) {
            // path ของ parent เอาไว้แยกแยะ record ที่ชื่อซ้ำกันแต่คนละสาย (เช่น
            // "Others" สองที่ใต้หมวดหมู่คนละตัว) — ดู path เดียวกันที่
            // CategoryController::searchCategories() ใช้อยู่แล้ว
            $sub = match ($depth) {
                1 => $category->parent?->name,
                2 => $category->parent ? trim(($category->parent->parent?->name ? $category->parent->parent->name.' > ' : '').$category->parent->name) : null,
                default => null,
            };

            return [
                'id' => $category->id,
                'label' => $category->name,
                'sub' => $sub,
                'url' => "{$editPrefix}/{$category->id}/edit",
            ];
        })->values();
    }

    /**
     * ผู้ใช้ไม่มีคอลัมน์ `name` จริง (เป็น accessor ที่ประกอบจาก first_name +
     * last_name — ดู User::name()) เลย query ต้องแยกทีละคอลัมน์จริงแทนที่จะใช้
     * searchMaster() ทั่วไป — ค้นได้ทั้งชื่อ-สกุล, username, email, รหัสพนักงาน
     */
    private function searchUsers(string $query): Collection
    {
        $users = User::query()
            ->where(fn (Builder $q) => $q
                ->where('first_name', 'ilike', self::likePattern($query))
                ->orWhere('last_name', 'ilike', self::likePattern($query))
                ->orWhere('username', 'ilike', self::likePattern($query))
                ->orWhere('email', 'ilike', self::likePattern($query))
                ->orWhere('employee_id', 'ilike', self::likePattern($query)))
            ->limit(self::LIMIT)
            ->get(['id', 'first_name', 'last_name', 'username', 'email']);

        return $users->map(fn (User $user) => [
            'id' => $user->id,
            'label' => $user->name !== '' ? $user->name : $user->username,
            'sub' => $user->username,
            'url' => "/system/user/{$user->id}/edit",
        ])->values();
    }

    /**
     * Shared shape for every simple "master" table: search 1+ columns with
     * ILIKE (+ every language's translated label, for models that have one),
     * cap at self::LIMIT, map straight to {id, label, sub, url}. Covers every
     * master here except products/categories (depth-based, see above) and
     * users (no real `name` column — see searchUsers()).
     *
     * Matching happens against BOTH the raw column (whatever's actually
     * stored in e.g. `brands.name` — usually Thai) AND, when `$hasTranslations`
     * is true, every language's row in that model's `translations` relation —
     * without the latter, searching "Electric tools" would find nothing for
     * a category whose raw `name` is the Thai "เครื่องมือไฟฟ้า" even though
     * its English translation says exactly that.
     *
     * The *displayed* label separately relies on `translations` staying
     * eager-loaded (this method never calls ->without('translations')):
     * $record->{$labelColumn} resolves through each model's own translated-
     * label accessor (Brand::name(), Attribute::name(), ... all follow the
     * same "translations loaded? use the current locale's row" pattern), so
     * the suggestion shows in whatever language the admin is currently
     * browsing in — independent of which language the query text happened to
     * match against above. Models with no `translations` relation at all
     * (Point, CommissionGroup, Role, Department, JobPosition — pass
     * `$hasTranslations: false`) are unaffected either way.
     *
     * @param  class-string<Model>  $modelClass
     * @param  string[]  $matchColumns  columns matched with ILIKE '%query%' (OR'd together)
     */
    private function searchMaster(
        string $modelClass,
        string $query,
        string $editUrlPrefix,
        array $matchColumns,
        string $labelColumn,
        ?string $subColumn,
        bool $hasTranslations,
    ): Collection {
        $selectColumns = array_values(array_unique(array_merge(
            ['id'],
            $matchColumns,
            [$labelColumn],
            $subColumn ? [$subColumn] : [],
        )));

        $records = $modelClass::query()
            ->where(function (Builder $q) use ($matchColumns, $query, $hasTranslations) {
                foreach ($matchColumns as $index => $column) {
                    $index === 0 ? $q->where($column, 'ilike', self::likePattern($query)) : $q->orWhere($column, 'ilike', self::likePattern($query));
                }
                if ($hasTranslations) {
                    $q->orWhereHas('translations', fn (Builder $t) => $t->where('label', 'ilike', self::likePattern($query)));
                }
            })
            ->limit(self::LIMIT)
            ->get($selectColumns);

        return $records->map(fn (Model $record) => [
            'id' => $record->getKey(),
            'label' => (string) $record->{$labelColumn},
            'sub' => $subColumn ? $record->{$subColumn} : null,
            'url' => "{$editUrlPrefix}/{$record->getKey()}/edit",
        ])->values();
    }
}
