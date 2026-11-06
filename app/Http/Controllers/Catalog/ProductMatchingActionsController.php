<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingComponent;
use App\Models\Product;
use App\Services\Marketplace\Listings\ListingMatchSuggester;
use App\Services\Marketplace\Listings\ListingScoreSuggester;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Product Matching phase 2 — the write actions of the "จับคู่สินค้า" page.
 * DB only: nothing here calls a marketplace API.
 *
 * Every action requires products.edit_products (route middleware) and that
 * the user can access the listing's shop (403 otherwise), and writes one
 * AuditLog row per changed listing (MarketplaceListing itself isn't
 * Auditable — the sync touches thousands of rows).
 *
 * Unlink resets match_method to NULL, so the next sync may auto-match the
 * listing again by exact SKU; to keep a listing out of matching, ignore it.
 */
class ProductMatchingActionsController extends Controller
{
    private const MAX_QTY = 9999;

    public function __construct(private readonly ListingMatchSuggester $suggester) {}

    public function link(Request $request, MarketplaceListing $listing): RedirectResponse
    {
        $this->authorizeShop($request, $listing);
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'pack_quantity' => ['nullable', 'integer', 'min:1', 'max:'.self::MAX_QTY],
        ]);

        $this->applySingle($request, $listing, (int) $validated['product_id'], $validated['pack_quantity'] ?? null, MarketplaceListing::MATCH_MANUAL);
        $sku = Product::whereKey($validated['product_id'])->value('sku');

        return back()->with('success', "ผูก {$this->label($listing)} กับ {$sku} แล้ว");
    }

    public function bundle(Request $request, MarketplaceListing $listing): RedirectResponse
    {
        $this->authorizeShop($request, $listing);
        $validated = $request->validate([
            'components' => ['required', 'array', 'min:2', 'max:50'],
            'components.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'],
            'components.*.quantity' => ['required', 'integer', 'min:1', 'max:'.self::MAX_QTY],
        ]);

        $components = array_map(fn ($c) => ['product_id' => (int) $c['product_id'], 'quantity' => (int) $c['quantity']], $validated['components']);
        $this->applyBundle($request, $listing, $components, MarketplaceListing::MATCH_BUNDLE);

        return back()->with('success', "ผูก {$this->label($listing)} เป็นชุดรวม ".count($components).' สินค้าแล้ว');
    }

    /**
     * Applies one of the listing's current suggestions. The suggestion is
     * recomputed server-side — the client only says which one (index + type)
     * — so a stale page can't link something the suggester no longer offers.
     */
    public function accept(Request $request, MarketplaceListing $listing): RedirectResponse
    {
        $this->authorizeShop($request, $listing);
        $validated = $request->validate([
            'index' => ['nullable', 'integer', 'min:0'],
            'type' => ['required', 'string'],
            'product_id' => ['nullable', 'integer'],
        ]);

        if ($listing->isLinked() || $listing->ignored_at !== null) {
            return back()->with('error', "{$this->label($listing)} ถูกผูกหรือซ่อนไปแล้ว — รีเฟรชหน้าเพื่อดูข้อมูลล่าสุด");
        }

        // score-based ("ชื่อ/แบรนด์ใกล้เคียง") suggestion: accepted only while
        // it is still in the stored list for this listing (stale-safe — the
        // list is replaced on every sync / marketplace:suggest-matches)
        if ($validated['type'] === ListingScoreSuggester::TYPE) {
            $stored = empty($validated['product_id']) ? null : DB::table('marketplace_listing_suggestions')
                ->where('marketplace_listing_id', $listing->id)
                ->where('product_id', (int) $validated['product_id'])
                ->first(['product_id', 'score', 'rank']);
            if ($stored === null) {
                return back()->with('error', "คำแนะนำของ {$this->label($listing)} เปลี่ยนไปแล้ว — รีเฟรชหน้าแล้วลองใหม่");
            }

            $this->applySingle($request, $listing, (int) $stored->product_id, null, MarketplaceListing::MATCH_SUGGESTED, ListingScoreSuggester::TYPE, ['suggestion_score' => (int) $stored->score]);
            $sku = Product::whereKey($stored->product_id)->value('sku');

            return back()->with('success', "ผูก {$this->label($listing)} กับ {$sku} ตามคำแนะนำ (คะแนน {$stored->score}) แล้ว");
        }

        $suggestion = ($this->suggester->suggest([$listing->id => $listing->seller_sku])[$listing->id] ?? [])[$validated['index'] ?? 0] ?? null;
        if ($suggestion === null || $suggestion['type'] !== $validated['type']) {
            return back()->with('error', "คำแนะนำของ {$this->label($listing)} เปลี่ยนไปแล้ว — รีเฟรชหน้าแล้วลองใหม่");
        }

        $this->applySuggestion($request, $listing, $suggestion);

        return back()->with('success', "ยืนยันคำแนะนำของ {$this->label($listing)} แล้ว");
    }

    /**
     * Accepts the top suggestion of many listings at once — only 'high'
     * confidence ones (ListingMatchSuggester::HIGH_TYPES); the rest are
     * skipped and counted. Score-based suggestions (ListingScoreSuggester,
     * always 'low') are never considered here — only the rule suggester is
     * asked.
     */
    public function bulkAccept(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'listing_ids' => ['required', 'array', 'min:1', 'max:500'],
            'listing_ids.*' => ['integer'],
        ]);

        $listings = MarketplaceListing::with('shop')->whereKey($validated['listing_ids'])->get();
        foreach ($listings->pluck('shop')->unique('id') as $shop) {
            if (! $request->user()?->canAccessShop($shop)) {
                abort(403);
            }
        }

        $open = $listings->filter(fn (MarketplaceListing $l) => ! $l->isLinked() && $l->ignored_at === null);
        $suggestions = $this->suggester->suggest($open->pluck('seller_sku', 'id')->all());

        $accepted = 0;
        foreach ($open as $listing) {
            $top = $suggestions[$listing->id][0] ?? null;
            if ($top !== null && ListingMatchSuggester::isHigh($top)) {
                $this->applySuggestion($request, $listing, $top);
                $accepted++;
            }
        }
        $skipped = $listings->count() - $accepted;

        $message = "ยืนยันคำแนะนำแล้ว {$accepted} รายการ";
        if ($skipped > 0) {
            $message .= " — ข้าม {$skipped} รายการ (ไม่มีคำแนะนำความมั่นใจสูง หรือถูกผูก/ซ่อนไปแล้ว)";
        }

        return back()->with($accepted > 0 ? 'success' : 'warning', $message);
    }

    public function unlink(Request $request, MarketplaceListing $listing): RedirectResponse
    {
        $this->authorizeShop($request, $listing);
        $before = $this->snapshot($listing);

        DB::transaction(function () use ($listing) {
            $listing->components()->delete();
            $listing->forceFill([
                'product_id' => null,
                'pack_quantity' => null,
                'match_method' => null,
                'matched_at' => null,
                'matched_by' => null,
            ])->save();
        });

        AuditLog::record('marketplace_listing_unlinked', $listing, $before, $this->snapshot($listing->fresh()));

        return back()->with('success', "ยกเลิกการผูก {$this->label($listing)} แล้ว — การซิงค์ครั้งถัดไปอาจจับคู่อัตโนมัติอีกถ้า SKU ตรงกับ PIM (ถ้าไม่ต้องการ ให้ใช้ \"ซ่อน\")");
    }

    public function ignore(Request $request, MarketplaceListing $listing): RedirectResponse
    {
        $this->authorizeShop($request, $listing);
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        if ($listing->isLinked()) {
            return back()->with('error', "{$this->label($listing)} ผูกกับสินค้าอยู่ — ยกเลิกการผูกก่อนจึงจะซ่อนได้");
        }

        $listing->forceFill([
            'ignored_at' => now(),
            'ignored_by' => $request->user()?->id,
            'ignore_reason' => ($validated['reason'] ?? null) ?: null,
        ])->save();

        AuditLog::record('marketplace_listing_ignored', $listing, null, ['ignore_reason' => $listing->ignore_reason]);

        return back()->with('success', "ซ่อน {$this->label($listing)} แล้ว");
    }

    public function unignore(Request $request, MarketplaceListing $listing): RedirectResponse
    {
        $this->authorizeShop($request, $listing);
        $before = ['ignored_at' => $listing->ignored_at?->toIso8601String(), 'ignored_by' => $listing->ignored_by, 'ignore_reason' => $listing->ignore_reason];

        $listing->forceFill(['ignored_at' => null, 'ignored_by' => null, 'ignore_reason' => null])->save();

        AuditLog::record('marketplace_listing_unignored', $listing, $before, null);

        return back()->with('success', "เลิกซ่อน {$this->label($listing)} แล้ว");
    }

    private function authorizeShop(Request $request, MarketplaceListing $listing): void
    {
        $listing->loadMissing('shop');
        if (! $listing->shop || ! $request->user()?->canAccessShop($listing->shop)) {
            abort(403);
        }
    }

    private function applySuggestion(Request $request, MarketplaceListing $listing, array $suggestion): void
    {
        if ($suggestion['type'] === ListingMatchSuggester::TYPE_BUNDLE) {
            $this->applyBundle($request, $listing, array_map(
                fn ($i) => ['product_id' => $i['product_id'], 'quantity' => $i['quantity']],
                $suggestion['items']
            ), MarketplaceListing::MATCH_SUGGESTED, $suggestion['type']);

            return;
        }

        $this->applySingle($request, $listing, $suggestion['items'][0]['product_id'], $suggestion['pack_quantity'], MarketplaceListing::MATCH_SUGGESTED, $suggestion['type']);
    }

    private function applySingle(Request $request, MarketplaceListing $listing, int $productId, ?int $packQuantity, string $method, ?string $suggestionType = null, array $auditExtra = []): void
    {
        $before = $this->snapshot($listing);

        DB::transaction(function () use ($request, $listing, $productId, $packQuantity, $method) {
            $listing->components()->delete();
            $listing->forceFill([
                'product_id' => $productId,
                'pack_quantity' => $packQuantity,
                'match_method' => $method,
                'matched_at' => now(),
                'matched_by' => $request->user()?->id,
                'ignored_at' => null,
                'ignored_by' => null,
                'ignore_reason' => null,
            ])->save();
        });

        AuditLog::record('marketplace_listing_linked', $listing, $before, $this->snapshot($listing->fresh()) + array_filter(['suggestion_type' => $suggestionType]) + $auditExtra);
    }

    /**
     * A bundle = component rows + product_id NULL; match_method is 'bundle'
     * (by hand) or 'suggested' (accepted suggestion).
     *
     * @param  list<array{product_id: int, quantity: int}>  $components
     */
    private function applyBundle(Request $request, MarketplaceListing $listing, array $components, string $method, ?string $suggestionType = null): void
    {
        $before = $this->snapshot($listing);

        DB::transaction(function () use ($request, $listing, $components, $method) {
            $listing->components()->delete();
            foreach ($components as $component) {
                MarketplaceListingComponent::create([
                    'marketplace_listing_id' => $listing->id,
                    'product_id' => $component['product_id'],
                    'quantity' => $component['quantity'],
                ]);
            }
            $listing->forceFill([
                'product_id' => null,
                'pack_quantity' => null,
                'match_method' => $method,
                'matched_at' => now(),
                'matched_by' => $request->user()?->id,
                'ignored_at' => null,
                'ignored_by' => null,
                'ignore_reason' => null,
            ])->save();
        });

        AuditLog::record('marketplace_listing_linked', $listing, $before, $this->snapshot($listing->fresh()) + array_filter(['suggestion_type' => $suggestionType]));
    }

    private function snapshot(MarketplaceListing $listing): array
    {
        return [
            'seller_sku' => $listing->seller_sku,
            'product_id' => $listing->product_id,
            'pack_quantity' => $listing->pack_quantity,
            'match_method' => $listing->match_method,
            'components' => $listing->components()->orderBy('product_id')->get(['product_id', 'quantity'])
                ->map(fn ($c) => ['product_id' => $c->product_id, 'quantity' => $c->quantity])->all(),
        ];
    }

    private function label(MarketplaceListing $listing): string
    {
        return $listing->seller_sku ?: "Item {$listing->item_id}";
    }
}
