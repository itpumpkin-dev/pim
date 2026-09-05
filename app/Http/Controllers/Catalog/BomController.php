<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductBom;
use App\Models\ProductBomComponent;
use App\Models\ProductValue;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "BOM" (Bill of Materials) master — /catalog/bom (เดิมเป็นแค่ placeholder
 * stub ในเมนู มาสเตอร์ ดู routes/catalog.php) สร้างโดยเลือกสินค้าที่มีอยู่
 * แล้วในระบบด้วย SKU (ไม่ได้สร้างสินค้าใหม่ — สินค้านั้นกลายเป็น "หัว"/finished
 * good ของ BOM ชุดนี้) แล้วค่อยกลับมาที่หน้าแก้ไขเพื่อเพิ่มรายการวัตถุดิบ (RM —
 * จำกัดแค่สินค้าที่อยู่ในสายหมวดหมู่ "วัตถุดิบ" (code v — ดู
 * rawMaterialCategoryIds() และ ProductController::search()) เท่านั้น เลือกได้
 * มากกว่า 1 ยังไม่มี "จำนวนที่ใช้" ต่อรายการตามที่ตกลงกันไว้ (ดู docblock ของ
 * migration create_product_boms_table)
 *
 * หมายเหตุ: เดิมจำกัดผ่าน flag Product.is_raw_material (ติ๊กเลือกทีละตัวผ่าน
 * หน้า Master /catalog/raw-materials — ดู RawMaterialController) เปลี่ยนมาอิง
 * หมวดหมู่แทนตามที่ user ขอ — หน้า /catalog/raw-materials กับคอลัมน์
 * is_raw_material เดิมยังอยู่เหมือนเดิม (ยังไม่ได้ลบ/ย้าย) แค่ไม่มีจุดไหนใน BOM
 * มาอ่านค่ามันต่อแล้วเท่านั้น
 */
class BomController extends Controller
{
    // ดู docblock ของ rawMaterialCategoryIds() ด้านล่าง — ตรงกับ
    // ProductController::RAW_MATERIAL_CATEGORY_CODE เป๊ะๆ (คัดลอกมาแทนที่จะ
    // ดึงจากคลาสนั้นตรงๆ เพื่อไม่ต้องผูก BomController เข้ากับ ProductController)
    private const RAW_MATERIAL_CATEGORY_CODE = 'v';

    /**
     * Category id ทั้งหมดในสายหมวดหมู่ "วัตถุดิบ" — คัดลอกมาจาก
     * ProductController::rawMaterialCategoryIds() (ต้องคำนวณเหมือนกันเป๊ะ ไม่งั้น
     * ตัวเลือกที่ ProductPicker ค้นเจอ กับตัวที่ validate ผ่านตอน save จะไม่ตรงกัน)
     */
    private function rawMaterialCategoryIds(): array
    {
        return Category::where('code', self::RAW_MATERIAL_CATEGORY_CODE)
            ->orWhere('code', 'like', self::RAW_MATERIAL_CATEGORY_CODE.'%')
            ->pluck('id')
            ->all();
    }

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

        $boms = ProductBom::withCount('components')
            ->with('product:id,sku')
            ->when($search !== '', function ($q) use ($search, $matchingProductIds) {
                $q->whereHas('product', function ($sub) use ($search, $matchingProductIds) {
                    $sub->where('sku', 'like', "%{$search}%");
                    if ($matchingProductIds->isNotEmpty()) {
                        $sub->orWhereIn('id', $matchingProductIds);
                    }
                });
            })
            ->orderByDesc('id')
            ->paginate($perPage)
            ->withQueryString();

        $names = $this->resolveProductNamesInCurrentLocale($boms->getCollection()->pluck('product.id'));

        $boms->getCollection()->transform(fn (ProductBom $bom) => [
            'id' => $bom->id,
            'product_id' => $bom->product->id,
            'sku' => $bom->product->sku,
            'name' => ($names[$bom->product->id] ?? null) ?: $bom->product->sku,
            'components_count' => $bom->components_count,
        ]);

        return Inertia::render('catalog/bom/index', [
            'boms' => $boms,
            'filters' => ['search' => $search],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/bom/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_id' => [
                'required',
                'integer',
                Rule::exists('products', 'id'),
                Rule::unique('product_boms', 'product_id'),
            ],
        ]);

        $bom = ProductBom::create(['product_id' => $validated['product_id']]);

        return to_route('catalog.bom.edit', $bom)->with('success', 'BOM created — add its raw materials below.');
    }

    public function edit(ProductBom $bom): Response
    {
        $bom->load(['product:id,sku', 'components.component:id,sku']);

        $productIds = collect([$bom->product->id])->merge($bom->components->pluck('component.id'));
        $names = $this->resolveProductNamesInCurrentLocale($productIds);

        return Inertia::render('catalog/bom/edit', [
            'bom' => [
                'id' => $bom->id,
                'product' => [
                    'id' => $bom->product->id,
                    'sku' => $bom->product->sku,
                    'name' => ($names[$bom->product->id] ?? null) ?: $bom->product->sku,
                ],
                'components' => $bom->components->map(fn (ProductBomComponent $c) => [
                    'id' => $c->component->id,
                    'sku' => $c->component->sku,
                    'name' => ($names[$c->component->id] ?? null) ?: $c->component->sku,
                ])->values(),
            ],
        ]);
    }

    /**
     * "แทนที่ทั้งชุด" ทุกครั้งที่ save — ตรงกับรูปแบบเดียวกับ
     * ProductController::syncAssociations() (ลบของเดิมที่ไม่อยู่ในลิสต์ใหม่
     * ทิ้ง แล้ว insert ตัวที่ยังไม่มี) ง่ายกว่า diff ทีละแถวมาก และ BOM ไม่ได้
     * มีข้อมูลอื่นต่อแถว (ไม่มีจำนวน) ที่จะเสียหายถ้าลบ-สร้างใหม่
     */
    public function update(Request $request, ProductBom $bom): RedirectResponse
    {
        // เช็คผ่าน category แทน flag is_raw_material เดิม (ดู
        // rawMaterialCategoryIds() ด้านบน) — คำนวณครั้งเดียวไว้นอก validate()
        // ไม่งั้นแต่ละแถวใน component_ids.* จะยิง query นับ category ซ้ำเอง
        $rawMaterialCategoryIds = $this->rawMaterialCategoryIds();

        $validated = $request->validate([
            'component_ids' => ['present', 'array'],
            'component_ids.*' => [
                'integer',
                Rule::exists('products', 'id'),
                // แทนที่จะ join ผ่าน Product::categories() ตรงๆ — validate เข้า
                // pivot table product_category ตรงๆ เลย ให้ผลเดียวกันแต่ไม่ต้อง
                // ใช้ whereHas ที่ Rule::exists() ไม่รองรับ
                Rule::exists('product_category', 'product_id')->whereIn('category_id', $rawMaterialCategoryIds),
                // BOM ห้ามใช้ตัวเองเป็นวัตถุดิบของตัวเอง
                Rule::notIn([$bom->product_id]),
            ],
        ]);

        // array_unique กันไว้ก่อนเสมอ ไม่พึ่งพาแค่ฝั่ง ProductPicker (ที่ตัดตัวซ้ำ
        // ออกจากผลค้นหาอยู่แล้วปกติ) — ถ้ามี id ซ้ำหลุดมาถึงตรงนี้จริงๆ (เช่น ยิง
        // request ตรงๆ ข้ามหน้าจอ) จะชน unique constraint (product_bom_id,
        // component_product_id) กลายเป็น QueryException ดิบๆ (500) แทนที่จะ
        // เซฟสำเร็จตามที่ควรเป็น
        $bom->components()->delete();
        foreach (array_values(array_unique($validated['component_ids'])) as $index => $componentId) {
            ProductBomComponent::create([
                'product_bom_id' => $bom->id,
                'component_product_id' => $componentId,
                'sort_order' => $index,
            ]);
        }

        return back()->with('success', 'BOM updated successfully.');
    }

    public function destroy(ProductBom $bom): RedirectResponse
    {
        $bom->delete();

        return to_route('catalog.bom.index')->with('success', 'BOM deleted successfully.');
    }

    /**
     * คัดลอกมาจาก ProductController::resolveProductNamesInCurrentLocale()
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
