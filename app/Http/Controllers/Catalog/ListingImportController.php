<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceListing;
use App\Models\Product;
use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailService;
use App\Services\Marketplace\Listings\ListingImageImportService;
use App\Services\Marketplace\Listings\ListingImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "นำเข้าและแก้ไขข้อมูลจาก {platform}" on the Product Mapping object page (see
 * ListingImportService / ListingImageImportService):
 *  - form:   the platform-shaped edit form for this product (+ the linked
 *            listing's values when ?listing= is given — its cached detail,
 *            fetched first when missing/stale or with ?refresh=1);
 *  - save:   writes the edited values to PIM (never pushes);
 *  - images: downloads chosen listing images into the PIM gallery.
 * All need products.edit_products (route); a listing must be on a shop the
 * user can access and linked directly to this product or one of its variants.
 */
class ListingImportController extends Controller
{
    public function __construct(
        private readonly ListingImportService $importer,
        private readonly ListingImageImportService $images,
        private readonly MarketplaceListingDetailService $details,
    ) {}

    public function form(Request $request, Product $product, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $listing = $this->listingFrom($request, $product, $platform, 'listing');
        $detail = $listing ? $this->details->fetch($listing->shop, (string) $listing->item_id, force: $request->boolean('refresh')) : null;
        $hasData = (bool) $detail?->hasData();

        return response()->json([
            'listing' => $listing ? [
                'id' => $listing->id,
                'item_id' => $listing->item_id,
                'seller_sku' => $listing->seller_sku,
                'shop' => $listing->shop->name,
            ] : null,
            'detail' => $detail ? [
                'has_data' => $hasData,
                'fetched_at' => $detail->fetched_at?->toIso8601String(),
                'fetch_error' => $detail->fetch_error,
                'category_id' => $detail->category_id,
                'category_name' => $detail->category_name,
                'status' => $detail->status,
                'listing_url' => $detail->listing_url ?? $listing->url,
                'variants' => $hasData ? array_values($detail->variants ?? []) : [],
            ] : null,
            'rows' => $this->importer->plan($product, $platform, $listing, $detail, $this->categoryId($request), $request->user()),
            'images' => $hasData ? $this->images->plan($product, $detail, $request->user()) : null,
            'gallery' => $this->images->gallery($product, $request->user()),
        ]);
    }

    /** gallery editor of the step (reorder / remove / upload) — the whole new `pgallery` list, see ListingImageImportService::saveGallery() */
    public function saveGallery(Request $request, Product $product): JsonResponse
    {
        $validated = $request->validate([
            'paths' => ['present', 'array', 'max:'.ListingImageImportService::MAX_IMAGES],
            'paths.*' => ['required', 'string', 'max:512'],
        ]);

        $result = $this->images->saveGallery($product, $validated['paths'], $request->user());

        return response()->json([
            ...$result,
            'gallery' => $this->images->gallery($product, $request->user()),
            'message' => "บันทึกแกลเลอรีแล้ว ({$result['saved']} รูป)",
        ]);
    }

    public function save(Request $request, Product $product, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $validated = $request->validate([
            'values' => ['required', 'array', 'min:1'],
        ]);
        $listing = $this->listingFrom($request, $product, $platform, 'listing_id');
        $detail = $listing ? $this->details->find($listing->shop, (string) $listing->item_id) : null;

        $result = $this->importer->apply($product, $platform, $listing, $detail, $this->categoryId($request), $validated['values'], $request->user());

        if ($result['errors'] !== []) {
            return response()->json(['message' => 'บางช่องไม่ถูกต้อง — แก้แล้วบันทึกใหม่', ...$result], 422);
        }

        return response()->json([
            ...$result,
            'message' => $result['written'] > 0 ? "บันทึกลง PIM แล้ว {$result['written']} ฟิลด์" : 'ไม่มีการเปลี่ยนแปลง',
        ]);
    }

    public function applyImages(Request $request, Product $product, MarketplaceListing $listing): JsonResponse
    {
        $this->authorizeListing($request, $product, $listing);
        $validated = $request->validate([
            'urls' => ['required', 'array', 'min:1', 'max:30'],
            'urls.*' => ['required', 'string', 'max:2048'],
            'mode' => ['required', 'in:replace,append'],
        ]);

        $detail = $this->details->find($listing->shop, (string) $listing->item_id);
        if (! $detail?->hasData()) {
            return response()->json(['message' => 'ยังไม่มีรายละเอียดของ listing นี้ — โหลดหน้าใหม่อีกครั้ง'], 422);
        }

        $result = $this->images->apply($product, $listing, $detail, $validated['urls'], $validated['mode'], $request->user());
        $failed = count($result['failed']);

        return response()->json([
            ...$result,
            'message' => $result['written'] > 0
                ? "นำเข้ารูปภาพ {$result['written']} รูปแล้ว".($failed > 0 ? " (ดาวน์โหลดไม่สำเร็จ {$failed} รูป)" : '')
                : 'ดาวน์โหลดรูปภาพไม่สำเร็จ',
        ], $result['written'] > 0 ? 200 : 422);
    }

    /**
     * The platform category of the listing this product is matched to — the Product Mapping page
     * preselects it in "1. Category Mapping" while the product's Master Category isn't mapped yet
     * (the user still saves it, since that mapping applies to every product in the category).
     * Cached listing details are used first; when none of the product's direct listings has one,
     * the first listing's detail is fetched from the platform once (then cached like every detail).
     */
    public function listingCategory(Request $request, Product $product, string $platform): JsonResponse
    {
        $this->assertPlatform($platform);
        $productIds = [$product->id, ...Product::where('parent_id', $product->id)->pluck('id')->all()];

        $listings = MarketplaceListing::with('shop.platform')
            ->whereIn('product_id', $productIds)
            ->orderBy('id')
            ->get()
            ->filter(fn (MarketplaceListing $l) => $l->shop
                && $request->user()?->canAccessShop($l->shop)
                && ListingImportService::platformOf($l) === $platform)
            ->unique(fn (MarketplaceListing $l) => $l->sales_platform_shop_id.':'.$l->item_id)
            ->values();

        $answer = fn (MarketplaceListing $l, $detail, string $source) => response()->json([
            'category_id' => (int) $detail->category_id,
            'category_name' => $detail->category_name,
            'shop' => $l->shop->name,
            'source' => $source,
        ]);

        foreach ($listings as $listing) {
            $detail = $this->details->find($listing->shop, (string) $listing->item_id);
            if ($detail && ctype_digit((string) $detail->category_id)) {
                return $answer($listing, $detail, 'cache');
            }
        }

        if ($first = $listings->first()) {
            try {
                $detail = $this->details->fetch($first->shop, (string) $first->item_id);
                if (ctype_digit((string) $detail->category_id)) {
                    return $answer($first, $detail, 'fetched');
                }
            } catch (\Throwable) {
                // platform unreachable / item gone — just no suggestion
            }
        }

        return response()->json(['category_id' => null, 'category_name' => null, 'shop' => null, 'source' => null]);
    }

    private function assertPlatform(string $platform): void
    {
        if (! in_array($platform, ListingImportService::PLATFORMS, true)) {
            abort(404);
        }
    }

    private function categoryId(Request $request): ?int
    {
        $id = $request->input('category_id');

        return is_numeric($id) ? (int) $id : null;
    }

    private function listingFrom(Request $request, Product $product, string $platform, string $param): ?MarketplaceListing
    {
        $id = $request->input($param);
        if (! is_numeric($id)) {
            return null;
        }
        $listing = MarketplaceListing::findOrFail((int) $id);
        $this->authorizeListing($request, $product, $listing);
        if (ListingImportService::platformOf($listing) !== $platform) {
            abort(404, 'listing นี้ไม่ได้อยู่บนแพลตฟอร์มนี้');
        }

        return $listing;
    }

    private function authorizeListing(Request $request, Product $product, MarketplaceListing $listing): void
    {
        $listing->loadMissing('shop.platform');
        if (! $listing->shop || ! $request->user()?->canAccessShop($listing->shop)) {
            abort(403);
        }
        if (! ListingImportService::listingBelongsTo($listing, $product) || ListingImportService::platformOf($listing) === null) {
            abort(404, 'listing นี้ไม่ได้ผูกกับสินค้านี้');
        }
    }
}
