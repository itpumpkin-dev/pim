<?php

namespace App\Services\Catalog;

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\CodeRenameGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Renames a category's `code` (categories / subcategories / product groups all
 * share the one table) and carries every string copy of it along.
 *
 * Category codes are ERP ids that encode the tree — a child's code starts with
 * its parent's (a025 → a025001 → a025001001), and several lookups rely on it
 * (ProductController::masterCategoryOptions() `code ilike parent%`, the raw
 * material `v%` scope, ProductCategoryLinker's "deepest = longest code"). So
 * a rename also re-prefixes every descendant whose code started with the old
 * one. Copies that follow:
 *  - attribute_options mirrored from categories (MasterAttributeOptionSync) —
 *    updated in place so their ids (and marketplace option mappings) survive;
 *  - product_values of those category-bound attributes (pcatname & co. store
 *    the lowercased code);
 *  - woo_category_aliases' pcatname / psubcatname / productgroupname.
 * Things outside the DB (ERP import files, the public API's /categories/{code})
 * keep the old code — callers are warned about that on the edit page.
 */
class CategoryCodeRenamer
{
    private const CATEGORY_SOURCES = ['categories', 'subcategories', 'product_groups'];

    private const ALIAS_COLUMNS = ['pcatname', 'psubcatname', 'productgroupname'];

    /** Codes the app looks up directly — never renamable. */
    public static function lockedCodes(): array
    {
        return [ProductController::RAW_MATERIAL_CATEGORY_CODE];
    }

    /**
     * CodeRenameGuard::resolve() plus the category-specific checks below —
     * the new code, or null when the request doesn't change it.
     */
    public function resolve(Request $request, Category $category, string $resource): ?string
    {
        $newCode = CodeRenameGuard::resolve($request, $category, $resource, self::lockedCodes());
        if ($newCode !== null) {
            $this->assertRenamable($category, $newCode);
        }

        return $newCode;
    }

    /**
     * Checks that don't fit CodeRenameGuard's generic format/unique rules.
     * Call before rename(), outside any transaction.
     */
    public function assertRenamable(Category $category, string $newCode): void
    {
        $raw = strtolower(ProductController::RAW_MATERIAL_CATEGORY_CODE);
        $wasRaw = str_starts_with(strtolower($category->code), $raw);
        $isRaw = str_starts_with(strtolower($newCode), $raw);
        if ($wasRaw !== $isRaw) {
            // raw-material scope is `code = 'v' OR code ilike 'v%'` — a rename
            // must not silently move a category into or out of it
            throw ValidationException::withMessages([
                'code' => $wasRaw
                    ? "Raw-material category codes must keep starting with \"{$raw}\"."
                    : "Only raw-material categories may start with \"{$raw}\".",
            ]);
        }

        $map = $this->renameMap($category, $newCode);
        $clash = Category::whereIn(DB::raw('lower(code)'), array_map('strtolower', array_values($map)))
            ->whereNotIn('id', array_keys($map))
            ->value('code');
        if ($clash !== null) {
            throw ValidationException::withMessages([
                'code' => "Renaming would give a sub-category the code \"{$clash}\", which is already taken.",
            ]);
        }
    }

    /**
     * Renames $category's descendants and every string copy. The category row
     * itself is left for the caller to save (so its own update() — and the
     * Auditable "updated" entry — carries the new code). Run inside the
     * caller's transaction.
     *
     * @return array<string, string> old code => new code, the category itself included
     */
    public function rename(Category $category, string $newCode): array
    {
        $map = $this->renameMap($category, $newCode);
        $codes = Category::whereIn('id', array_keys($map))->pluck('code', 'id');

        $renames = [];
        foreach ($map as $id => $to) {
            $renames[$codes[$id]] = $to;
        }

        $this->renameMirroredValues($renames);

        // Descendants go through the query builder: their only change is the
        // re-prefixed code (no per-row audit noise), and parking them on a
        // temporary code first avoids tripping the unique index when one new
        // code equals another row's old code mid-update.
        $descendantIds = array_values(array_diff(array_keys($map), [$category->id]));
        if ($descendantIds !== []) {
            DB::table('categories')->whereIn('id', $descendantIds)->update(['code' => DB::raw("'__renaming_' || id")]);
            foreach ($descendantIds as $id) {
                DB::table('categories')->where('id', $id)->update(['code' => $map[$id]]);
            }
        }

        DB::afterCommit(function () {
            Category::bumpTreeCacheVersion();
            Product::bumpStorefrontVersion();
        });

        return $renames;
    }

    /**
     * @return array<int, string> category id => new code (the category itself + re-prefixed descendants)
     */
    private function renameMap(Category $category, string $newCode): array
    {
        $old = $category->code;
        $map = [$category->id => $newCode];

        $frontier = [$category->id];
        while ($frontier !== []) {
            $children = Category::whereIn('parent_id', $frontier)->get(['id', 'code']);
            $frontier = [];
            foreach ($children as $child) {
                $frontier[] = $child->id;
                if (stripos($child->code, $old) === 0) {
                    $map[$child->id] = $newCode.substr($child->code, strlen($old));
                }
            }
        }

        return $map;
    }

    /**
     * @param  array<string, string>  $renames  old code => new code
     */
    private function renameMirroredValues(array $renames): void
    {
        $attributes = Attribute::whereIn('master_source', self::CATEGORY_SOURCES)->get(['id', 'type']);
        $lower = [];
        foreach ($renames as $from => $to) {
            $lower[strtolower($from)] = strtolower($to);
        }

        foreach ($attributes as $attribute) {
            // park first for the same unique-index reason as the categories
            $options = AttributeOption::where('attribute_id', $attribute->id)->whereIn('code', array_keys($lower))->get(['id', 'code']);
            foreach ($options as $option) {
                DB::table('attribute_options')->where('id', $option->id)->update(['code' => '__renaming_'.$option->id]);
            }
            foreach ($options as $option) {
                DB::table('attribute_options')->where('id', $option->id)->update(['code' => $lower[$option->code]]);
            }

            if ($attribute->type === 'multiselect') {
                ProductValue::where('attribute_id', $attribute->id)->whereNotNull('value')->chunkById(500, function ($values) use ($lower) {
                    foreach ($values as $value) {
                        $decoded = json_decode((string) $value->value, true);
                        if (! is_array($decoded)) {
                            continue;
                        }
                        $next = array_map(fn ($code) => is_string($code) ? ($lower[strtolower($code)] ?? $code) : $code, $decoded);
                        if ($next !== $decoded) {
                            DB::table('product_values')->where('id', $value->id)->update(['value' => json_encode(array_values($next))]);
                        }
                    }
                });

                continue;
            }

            // one CASE update, not one per pair: a new code can equal another
            // renamed row's old code (a025 -> a025001 while child a025001 ->
            // a025001001), and sequential updates would rename values twice
            $this->remapColumn('product_values', 'value', $lower, ['attribute_id' => $attribute->id]);
        }

        // aliases are typed/uploaded by hand, so match case-insensitively but
        // write the code as the category itself now spells it
        $aliasMap = [];
        foreach ($renames as $from => $to) {
            $aliasMap[strtolower((string) $from)] = (string) $to;
        }
        foreach (self::ALIAS_COLUMNS as $column) {
            $this->remapColumn('woo_category_aliases', $column, $aliasMap);
        }
    }

    /**
     * Rewrites $column via lower($column) => new value in a single statement.
     *
     * @param  array<string, string>  $map  lowercased old value => new value
     * @param  array<string, mixed>  $where
     */
    private function remapColumn(string $table, string $column, array $map, array $where = []): void
    {
        if ($map === []) {
            return;
        }

        $cases = [];
        $bindings = [];
        foreach ($map as $from => $to) {
            $cases[] = 'WHEN ? THEN ?';
            array_push($bindings, (string) $from, (string) $to);
        }

        $conditions = [];
        foreach ($where as $col => $value) {
            $conditions[] = "{$col} = ?";
            $bindings[] = $value;
        }

        $froms = array_map('strval', array_keys($map));
        $conditions[] = "lower({$column}) IN (".implode(', ', array_fill(0, count($froms), '?')).')';
        array_push($bindings, ...$froms);

        DB::update(
            "UPDATE {$table} SET {$column} = CASE lower({$column}) ".implode(' ', $cases).' END WHERE '.implode(' AND ', $conditions),
            $bindings,
        );
    }
}
