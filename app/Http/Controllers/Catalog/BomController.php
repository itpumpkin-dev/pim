<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
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
 * จำกัดแค่สินค้าที่ถูกจัดเป็นวัตถุดิบไว้แล้วผ่านหน้า Master
 * /catalog/raw-materials เท่านั้น ดู RawMaterialController) เลือกได้มากกว่า 1
 * ยังไม่มี "จำนวนที่ใช้" ต่อรายการตามที่ตกลงกันไว้ (ดู docblock ของ migration
 * create_product_boms_table)
 */
class BomController extends Controller
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
        $validated = $request->validate([
            'component_ids' => ['present', 'array'],
            'component_ids.*' => [
                'integer',
                Rule::exists('products', 'id')->where('is_raw_material', true),
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
