<?php

namespace App\Http\Controllers;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\ProductViewEvent;
use App\Models\User;
use App\Services\Catalog\ProductPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public-facing product pages (home, product detail). Unlike
 * Catalog\ProductController, these routes carry no auth/permission
 * middleware, so only enabled, sellable (type=simple) products are ever
 * queried or exposed here.
 *
 * show() still honours Attribute Access permissions when a viewer happens to
 * be logged in (e.g. staff browsing while signed in): Attribute Groups they
 * can't see (e.g. Pricing & Packaging) are blanked out of the mapped product
 * via ProductPresenter. Anonymous visitors are always unrestricted, same as
 * home().
 */
class StorefrontController extends Controller
{
    /**
     * Ceiling on how stale the cached home() payload can get from a write
     * path that doesn't go through Product::bumpStorefrontVersion() (e.g.
     * an import job or marketplace sync) — the version bump already makes
     * every ProductController edit/create/delete show up immediately, this
     * is just a safety net for the rest.
     */
    private const CACHE_TTL_SECONDS = 300;

    public function home(): Response
    {
        // Follows whatever locale the visitor has switched to, same as
        // show() — cache key includes it (matching CategoryController::tree()'s
        // convention) so a Thai-resolved payload cached for one visitor never
        // leaks out to an English/Chinese one, or vice versa.
        $localeCode = app()->getLocale();

        $payload = Cache::remember(
            'storefront:home:v'.Product::storefrontVersion().':'.$localeCode,
            self::CACHE_TTL_SECONDS,
            function () use ($localeCode) {
                $products = Product::where('enabled', true)->where('type', 'simple')->orderBy('id')->get();

                $mapped = ProductPresenter::mapMany($products, $localeCode);

                $categories = collect($mapped)->pluck('category')->unique()->sort()->values()->all();

                return [
                    'products' => $mapped,
                    'categories' => $categories,
                    'topViewedProducts' => $this->topViewedProducts($mapped),
                ];
            }
        );

        return Inertia::render('home', $payload);
    }

    /**
     * Top 10 products by storefront click count, restricted to products
     * still enabled/sellable (same set as $mappedProducts), most-viewed first.
     */
    private function topViewedProducts(array $mappedProducts): array
    {
        $mappedById = collect($mappedProducts)->keyBy('id');

        $topProductIds = ProductViewEvent::selectRaw('product_id, COUNT(*) as views')
            ->where('event_type', 'click')
            ->whereIn('product_id', $mappedById->keys())
            ->groupBy('product_id')
            ->orderByDesc('views')
            ->limit(10)
            ->pluck('product_id');

        return $topProductIds->map(fn ($id) => $mappedById->get($id))->filter()->values()->all();
    }

    public function show(int $id, Request $request): Response
    {
        $viewer = $request->user();
        // Unlike home() (deliberately fixed to Thai), this page follows
        // whatever locale the visitor has switched to — see the
        // LocaleDropdown on products/show.tsx and SetLocale middleware,
        // which resolves this from a cookie for anonymous visitors too.
        $localeCode = app()->getLocale();

        // Only cache the anonymous-visitor payload. buildShowPayload() passes
        // $viewer into ProductPresenter::mapMany(), which can blank out
        // fields whose Attribute Group a logged-in viewer's role can't see
        // (Attribute Access) — a shared cache keyed without $viewer would
        // either leak those restricted fields to a restricted staff member
        // (served an anonymous-computed payload) or wrongly blank fields for
        // the public (served a payload computed for a restricted viewer).
        // This is the same risk home() sidesteps by never taking a $viewer
        // at all, per its class docblock.
        if (!$viewer) {
            return Inertia::render('products/show', Cache::remember(
                'storefront:product:'.$id.':v'.Product::storefrontVersion().':'.$localeCode,
                self::CACHE_TTL_SECONDS,
                fn () => $this->buildShowPayload($id, $localeCode, null)
            ));
        }

        return Inertia::render('products/show', $this->buildShowPayload($id, $localeCode, $viewer));
    }

    private function buildShowPayload(int $id, string $localeCode, ?User $viewer): array
    {
        $product = Product::where('id', $id)->where('enabled', true)->where('type', 'simple')->first();

        if (!$product) {
            return [
                'id' => $id,
                'product' => null,
                'related' => [],
            ];
        }

        $mapped = ProductPresenter::mapMany(collect([$product]), $localeCode, $viewer)[0];

        $categoryAttributeId = Attribute::idForCode('pcatname');

        // pcatname is a select field storing an AttributeOption code, not the
        // label — $mapped['category'] is already the resolved label (see
        // ProductPresenter::resolveSelectOptionLabels), so match products whose
        // raw value is either that same code, or (for values predating the
        // dropdown) the literal free-typed label text.
        $matchingCodes = $categoryAttributeId
            ? AttributeOption::where('attribute_id', $categoryAttributeId)->where('admin_label', $mapped['category'])->pluck('code')
            : collect();

        $relatedIds = $categoryAttributeId
            ? ProductValue::where('attribute_id', $categoryAttributeId)
                ->where(function ($query) use ($mapped, $matchingCodes) {
                    $query->where('value', $mapped['category']);
                    if ($matchingCodes->isNotEmpty()) {
                        $query->orWhereIn('value', $matchingCodes);
                    }
                })
                ->pluck('product_id')
            : collect();

        $related = Product::whereIn('id', $relatedIds)
            ->where('id', '!=', $product->id)
            ->where('enabled', true)
            ->where('type', 'simple')
            ->limit(4)
            ->get();

        return [
            'id' => $id,
            'product' => $mapped,
            'related' => ProductPresenter::mapMany($related, $localeCode, $viewer),
        ];
    }

    public function trackEvent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'event_type' => ['required', 'string', 'in:click,category_select'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'category' => ['nullable', 'string', 'max:150'],
        ]);

        ProductViewEvent::record(
            eventType: $validated['event_type'],
            productId: $validated['product_id'] ?? null,
            category: $validated['category'] ?? null,
        );

        return response()->json(['status' => 'ok']);
    }
}
