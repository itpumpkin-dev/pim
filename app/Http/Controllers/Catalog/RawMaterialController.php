<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "วัตถุดิบ" (Raw Material / RM) master — ไม่ใช่ตารางสินค้าใหม่ แค่หน้าจอ
 * สำหรับติ๊ก/เลือกว่าสินค้าตัวไหน (จากที่มีอยู่แล้วในระบบ) ใช้เป็นวัตถุดิบได้บ้าง
 * (`products.is_raw_material` — ดู migration add_is_raw_material_to_products_table)
 * ไม่ได้สร้างสินค้าใหม่เลย เอาไว้จำกัดขอบเขตตัวเลือกส่วนประกอบของ BOM
 * (ดู BomController) ให้เลือกได้แค่สินค้าที่ถูกจัดเป็น RM ไว้แล้วเท่านั้น
 *
 * ไม่มีหน้า "edit" แยก เพราะไม่มีอะไรให้แก้ไขนอกจากสถานะ "เป็น RM หรือไม่" —
 * store() = ติ๊กเพิ่ม (เลือกได้หลายตัวพร้อมกัน), destroy() = เอาออกจากลิสต์ RM
 * (แค่ปลด flag ไม่ได้ลบสินค้าจริง)
 */
class RawMaterialController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $nameAttributeId = Attribute::idForCode('pname');
        $matchingProductIds = $nameAttributeId && $search !== ''
            ? ProductValue::where('attribute_id', $nameAttributeId)->where('value', 'like', "%{$search}%")->pluck('product_id')
            : collect();

        $products = Product::where('is_raw_material', true)
            ->when($search !== '', function ($q) use ($search, $matchingProductIds) {
                $q->where(function ($sub) use ($search, $matchingProductIds) {
                    $sub->where('sku', 'like', "%{$search}%");
                    if ($matchingProductIds->isNotEmpty()) {
                        $sub->orWhereIn('id', $matchingProductIds);
                    }
                });
            })
            ->orderBy('sku')
            ->paginate($perPage)
            ->withQueryString();

        $names = $this->resolveProductNamesInCurrentLocale($products->getCollection()->pluck('id'));

        $products->getCollection()->transform(fn (Product $product) => [
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => ($names[$product->id] ?? null) ?: $product->sku,
        ]);

        return Inertia::render('catalog/raw-materials/index', [
            'products' => $products,
            'filters' => ['search' => $search],
        ]);
    }

    /**
     * ติ๊ก "เป็นวัตถุดิบ" ให้สินค้าที่เลือกมา (เลือกได้หลายตัวพร้อมกันจาก
     * ProductPicker) — ไม่ได้สร้างสินค้าใหม่ แค่เปลี่ยน flag ของตัวที่มีอยู่แล้ว
     */
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_ids' => ['required', 'array', 'min:1'],
            'product_ids.*' => ['integer', 'exists:products,id'],
        ]);

        Product::whereIn('id', $validated['product_ids'])->update(['is_raw_material' => true]);

        return back()->with('success', 'Marked as raw material.');
    }

    /**
     * เอาออกจากลิสต์ RM — ปลด flag เฉยๆ ไม่ลบสินค้าจริง กันไว้ก่อนถ้าสินค้านี้
     * ถูกใช้เป็นวัตถุดิบอยู่ใน BOM ไหนอยู่แล้วจริงๆ (ดู Product::bomComponentOf())
     * ไม่งั้น BOM นั้นจะเหลือ component ที่ผ่านการเช็ค "ต้องเป็น RM" ตอนบันทึกไปแล้ว
     * แต่ตอนนี้ไม่ใช่ RM อีกต่อไปเงียบๆ (หน้าแก้ไข BOM จะค้นหามันกลับมาแก้ไม่เจอ
     * อีกเลย เพราะตัวกรอง raw_material_only จะไม่คืนมันแล้ว)
     */
    public function destroy(Product $product): RedirectResponse
    {
        if ($product->bomComponentOf()->exists()) {
            throw ValidationException::withMessages([
                'product' => 'This product is used as a raw material in at least one BOM — remove it from those BOMs first.',
            ]);
        }

        $product->update(['is_raw_material' => false]);

        return back()->with('success', 'Removed from raw materials.');
    }

    /**
     * คัดลอกมาจาก ProductController::resolveProductNamesInCurrentLocale() —
     * หาค่า attribute `pname` ของแต่ละ product id ตาม locale ปัจจุบัน fallback
     * ไป scope แบบ global (locale_id=null) ถ้า locale นั้นไม่มีแถวของตัวเอง
     */
    private function resolveProductNamesInCurrentLocale(Collection $productIds): array
    {
        $nameAttributeId = Attribute::idForCode('pname');
        if (! $nameAttributeId || $productIds->isEmpty()) {
            return [];
        }

        $activeLocaleId = Locale::idForCode(app()->getLocale());

        $rowsByProduct = ProductValue::whereIn('product_id', $productIds)
            ->where('attribute_id', $nameAttributeId)
            ->whereNull('channel_id')
            ->get(['product_id', 'locale_id', 'value'])
            ->groupBy('product_id');

        $names = [];
        foreach ($rowsByProduct as $productId => $rows) {
            $match = $activeLocaleId ? $rows->firstWhere('locale_id', $activeLocaleId) : null;
            $names[$productId] = ($match ?? $rows->firstWhere('locale_id', null))?->value;
        }

        return $names;
    }
}
