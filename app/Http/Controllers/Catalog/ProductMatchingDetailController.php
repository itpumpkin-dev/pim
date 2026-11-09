<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Locale;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Services\Catalog\AttributeValueFormatter;
use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailService;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * "รายละเอียด" dialog of the Product Matching page — JSON endpoints.
 *
 *  - show:    the listing item's full detail (marketplace_listing_details),
 *             fetched on demand (read-only marketplace calls) when missing
 *             or older than the TTL — products.list_products.
 *  - refresh: the same, always re-fetched — products.edit_products.
 *
 * Both need access to the listing's shop (403 otherwise) and answer 200
 * even when the marketplace call failed: `detail.fetch_error` is set and the
 * previous good data (if any) is still returned. Plus, when the listing is
 * linked, a light PIM summary of the linked product(s) for side-by-side
 * comparison. `raw` is never sent to the browser.
 */
class ProductMatchingDetailController extends Controller
{
    private const PLATFORM_LABEL = ['lazada' => 'Lazada', 'shopee' => 'Shopee', 'tiktok' => 'TikTok', 'woocommerce' => 'WooCommerce'];

    public function __construct(private readonly MarketplaceListingDetailService $service) {}

    public function show(Request $request, MarketplaceListing $listing): JsonResponse
    {
        $this->authorizeShop($request, $listing);

        return response()->json($this->payload($listing, $this->service->fetch($listing->shop, (string) $listing->item_id)));
    }

    public function refresh(Request $request, MarketplaceListing $listing): JsonResponse
    {
        $this->authorizeShop($request, $listing);

        return response()->json($this->payload($listing, $this->service->fetch($listing->shop, (string) $listing->item_id, force: true)));
    }

    private function authorizeShop(Request $request, MarketplaceListing $listing): void
    {
        $listing->loadMissing('shop.platform');
        if (! $listing->shop || ! $request->user()?->canAccessShop($listing->shop)) {
            abort(403);
        }
    }

    private function payload(MarketplaceListing $listing, MarketplaceListingDetail $detail): array
    {
        $platform = MarketplaceListingFetcherResolver::platformKey($listing->shop) ?? $listing->platform;

        return [
            'listing' => [
                'id' => $listing->id,
                'item_id' => $listing->item_id,
                'variant_id' => $listing->variant_id,
                'seller_sku' => $listing->seller_sku,
                'name' => $listing->name,
                'url' => $listing->url,
                'platform' => $platform,
                'platform_label' => self::PLATFORM_LABEL[$platform] ?? $platform,
                'shop' => ['id' => $listing->shop->id, 'name' => $listing->shop->name],
            ],
            'detail' => [
                'has_data' => $detail->hasData(),
                'is_stale' => $detail->hasData() && ! $this->service->isFresh($detail),
                'name' => $detail->name,
                'description_text' => $detail->description_text,
                'brand_id' => $detail->brand_id,
                'brand_name' => $detail->brand_name,
                'category_id' => $detail->category_id,
                'category_name' => $detail->category_name,
                'images' => $detail->images ?? [],
                'video_url' => $detail->video_url,
                'attributes' => $detail->getAttribute('attributes') ?? [],
                'package' => $detail->package,
                'variants' => array_map(fn ($v) => ['options' => (object) ($v['options'] ?? [])] + $v, $detail->variants ?? []),
                'status' => $detail->status,
                'listing_url' => $detail->listing_url ?? $listing->url,
                'fetched_at' => $detail->fetched_at?->toIso8601String(),
                'fetch_error' => $detail->fetch_error,
                'fetch_duration_ms' => $detail->fetch_duration_ms,
            ],
            'pim' => $this->pimSummary($listing),
        ];
    }

    /**
     * Linked product(s): sku, name (pname, th first), price / brand (from
     * product_match_index — as of its last rebuild), first image value.
     */
    private function pimSummary(MarketplaceListing $listing): ?array
    {
        $quantities = $listing->product_id !== null
            ? [$listing->product_id => 1]
            : $listing->components()->orderBy('id')->pluck('quantity', 'product_id')->all();
        if ($quantities === []) {
            return null;
        }
        $ids = array_keys($quantities);

        $products = DB::table('products')->whereIn('id', $ids)->pluck('sku', 'id');
        $index = DB::table('product_match_index')->whereIn('product_id', $ids)->get(['product_id', 'price', 'brand_label'])->keyBy('product_id');
        $names = $this->names($ids);
        $images = $this->images($ids);

        $items = [];
        foreach ($ids as $id) {
            if (! isset($products[$id])) {
                continue;
            }
            $items[] = [
                'id' => (int) $id,
                'sku' => $products[$id],
                'name' => $names[$id] ?? null,
                'price' => isset($index[$id]) && $index[$id]->price !== null ? (float) $index[$id]->price : null,
                'brand' => $index[$id]->brand_label ?? null,
                'image_url' => $images[$id] ?? null,
                'quantity' => (int) $quantities[$id],
            ];
        }

        return $items === [] ? null : [
            'type' => $listing->product_id !== null ? 'single' : 'bundle',
            'pack_quantity' => $listing->pack_quantity,
            'products' => $items,
        ];
    }

    /** @return array<int, string> */
    private function names(array $ids): array
    {
        $nameId = Attribute::idForCode('pname');
        if (! $nameId) {
            return [];
        }
        $th = Locale::idForCode('th');
        $names = [];
        foreach (DB::table('product_values')->whereIn('product_id', $ids)->where('attribute_id', $nameId)->whereNull('channel_id')
            ->whereNotNull('value')->where('value', '<>', '')->get(['product_id', 'locale_id', 'value']) as $v) {
            if (! isset($names[$v->product_id]) || ($th && (int) $v->locale_id === $th)) {
                $names[$v->product_id] = $v->value;
            }
        }

        return $names;
    }

    /** @return array<int, string> first non-empty value of an image-type attribute */
    private function images(array $ids): array
    {
        $images = [];
        $rows = DB::table('product_values')
            ->join('attributes', 'attributes.id', '=', 'product_values.attribute_id')
            ->whereIn('product_values.product_id', $ids)
            ->where('attributes.type', 'image')
            ->whereNull('attributes.deleted_at')
            ->whereNull('product_values.channel_id')
            ->whereNotNull('product_values.value')->where('product_values.value', '<>', '')
            ->orderBy('attributes.id')
            ->get(['product_values.product_id', 'product_values.value']);
        foreach ($rows as $row) {
            if (isset($images[$row->product_id])) {
                continue;
            }
            $value = $row->value;
            if (str_starts_with($value, '[')) {
                $decoded = json_decode($value, true);
                $value = is_array($decoded) && is_string($decoded[0] ?? null) ? $decoded[0] : null;
            }
            if (($url = AttributeValueFormatter::resolveStorageUrl($value)) !== null) {
                $images[$row->product_id] = $url;
            }
        }

        return $images;
    }
}
