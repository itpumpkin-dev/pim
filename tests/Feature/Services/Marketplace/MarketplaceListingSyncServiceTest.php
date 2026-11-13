<?php

use App\Models\MarketplaceListing;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\Marketplace\Listings\LazadaListingFetcher;
use App\Services\Marketplace\Listings\MarketplaceListingFetcher;
use App\Services\Marketplace\Listings\MarketplaceListingSyncService;

/**
 * Product Matching phase 1 — MarketplaceListingSyncService with a fake
 * fetcher bound in the container (no HTTP).
 */
class FakeMarketplaceListingFetcher implements MarketplaceListingFetcher
{
    /** @param array<int, array<string, mixed>> $rows */
    public function __construct(public array $rows = [], public array $incomplete = []) {}

    public function fetch(SalesPlatformShop $shop): iterable
    {
        foreach ($this->rows as $row) {
            yield array_merge([
                'variant_id' => '',
                'seller_sku' => null,
                'name' => null,
                'status' => 'active',
                'is_active' => true,
                'price' => 100.0,
                'quantity' => 5,
                'image_url' => null,
                'url' => null,
            ], $row);
        }
    }

    public function incompleteItemIds(): array
    {
        return $this->incomplete;
    }
}

function mlsShop(): SalesPlatformShop
{
    $platform = SalesPlatform::create(['code' => 'lazada_'.uniqid(), 'name' => 'Lazada']);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'ML Shop']);
}

function mlsFake(array $rows, array $incomplete = []): FakeMarketplaceListingFetcher
{
    $fake = new FakeMarketplaceListingFetcher($rows, $incomplete);
    app()->bind(LazadaListingFetcher::class, fn () => $fake);

    return $fake;
}

function mlsSync(SalesPlatformShop $shop): array
{
    return app(MarketplaceListingSyncService::class)->syncShop($shop->fresh());
}

test('exact seller SKU match sets product_id with match_method auto_sku', function () {
    $shop = mlsShop();
    $product = Product::create(['sku' => 'MLS-A1']);
    mlsFake([
        ['item_id' => '100', 'variant_id' => '1', 'seller_sku' => ' MLS-A1 '],
        ['item_id' => '101', 'variant_id' => '2', 'seller_sku' => 'NO-SUCH-SKU'],
    ]);

    $stats = mlsSync($shop);

    expect($stats)->toMatchArray(['fetched' => 2, 'upserted' => 2, 'deleted' => 0, 'matched' => 1, 'unmatched' => 1]);
    $matched = MarketplaceListing::where('item_id', '100')->first();
    expect($matched->product_id)->toBe($product->id)
        ->and($matched->match_method)->toBe('auto_sku')
        ->and($matched->matched_at)->not->toBeNull()
        ->and($matched->matched_by)->toBeNull()
        ->and($matched->platform)->toBe('lazada');
    expect(MarketplaceListing::where('item_id', '101')->first()->product_id)->toBeNull();
});

test('manual and pushed matches are never touched by the auto-matcher or the upsert', function () {
    $shop = mlsShop();
    $manualTarget = Product::create(['sku' => 'MLS-MANUAL-TARGET']);
    $pushedTarget = Product::create(['sku' => 'MLS-PUSHED-TARGET']);
    Product::create(['sku' => 'MLS-B1']);
    $user = User::factory()->create();

    MarketplaceListing::create([
        'sales_platform_shop_id' => $shop->id, 'platform' => 'lazada', 'item_id' => '200', 'variant_id' => '',
        'seller_sku' => 'MLS-B1', 'product_id' => $manualTarget->id, 'match_method' => 'manual', 'matched_by' => $user->id,
        'matched_at' => now()->subDay(),
    ]);
    MarketplaceListing::create([
        'sales_platform_shop_id' => $shop->id, 'platform' => 'lazada', 'item_id' => '201', 'variant_id' => '',
        'seller_sku' => 'WHATEVER', 'product_id' => $pushedTarget->id, 'match_method' => 'pushed',
    ]);

    mlsFake([
        ['item_id' => '200', 'seller_sku' => 'MLS-B1', 'name' => 'Renamed'],
        ['item_id' => '201', 'seller_sku' => 'STILL-NO-MATCH'],
    ]);
    mlsSync($shop);

    $manual = MarketplaceListing::where('item_id', '200')->first();
    expect($manual->product_id)->toBe($manualTarget->id)
        ->and($manual->match_method)->toBe('manual')
        ->and($manual->matched_by)->toBe($user->id)
        ->and($manual->name)->toBe('Renamed');

    $pushed = MarketplaceListing::where('item_id', '201')->first();
    expect($pushed->product_id)->toBe($pushedTarget->id)->and($pushed->match_method)->toBe('pushed');
});

test('an auto_sku match is cleared when the seller SKU no longer matches, and re-matched to the new SKU', function () {
    $shop = mlsShop();
    $old = Product::create(['sku' => 'MLS-OLD']);
    $new = Product::create(['sku' => 'MLS-NEW']);

    mlsFake([['item_id' => '300', 'seller_sku' => 'MLS-OLD']]);
    mlsSync($shop);
    expect(MarketplaceListing::where('item_id', '300')->value('product_id'))->toBe($old->id);

    mlsFake([['item_id' => '300', 'seller_sku' => 'MLS-GONE']]);
    $stats = mlsSync($shop);
    $row = MarketplaceListing::where('item_id', '300')->first();
    expect($row->product_id)->toBeNull()->and($row->match_method)->toBeNull()->and($row->matched_at)->toBeNull();
    expect($stats['unmatched'])->toBe(1);

    mlsFake([['item_id' => '300', 'seller_sku' => 'MLS-NEW']]);
    mlsSync($shop);
    expect(MarketplaceListing::where('item_id', '300')->value('product_id'))->toBe($new->id);
});

test('rows not seen in the latest sync are deleted, except incomplete items; an empty fetch deletes nothing', function () {
    $shop = mlsShop();
    $otherShop = mlsShop();

    mlsFake([
        ['item_id' => '400', 'variant_id' => 'a'],
        ['item_id' => '400', 'variant_id' => 'b'],
        ['item_id' => '401'],
        ['item_id' => '402'],
    ]);
    mlsSync($shop);
    mlsSync($otherShop);
    expect(MarketplaceListing::where('sales_platform_shop_id', $shop->id)->count())->toBe(4);

    // Next sync: 400/b vanished, 401 vanished, 402 couldn't be read (incomplete).
    $this->travel(2)->seconds();
    mlsFake([['item_id' => '400', 'variant_id' => 'a']], incomplete: ['402']);
    $stats = mlsSync($shop);

    expect($stats['deleted'])->toBe(2);
    expect(MarketplaceListing::where('sales_platform_shop_id', $shop->id)->orderBy('item_id')->pluck('item_id')->all())->toBe(['400', '402']);
    // the other shop is untouched
    expect(MarketplaceListing::where('sales_platform_shop_id', $otherShop->id)->count())->toBe(4);

    // A fetch that yields nothing never wipes the shop.
    $this->travel(2)->seconds();
    mlsFake([]);
    $stats = mlsSync($shop);
    expect($stats['deleted'])->toBe(0);
    expect(MarketplaceListing::where('sales_platform_shop_id', $shop->id)->count())->toBe(2);
});

test('the same seller SKU on two listings in one shop matches both to the same product', function () {
    $shop = mlsShop();
    $product = Product::create(['sku' => 'MLS-DUP']);
    mlsFake([
        ['item_id' => '500', 'seller_sku' => 'MLS-DUP'],
        ['item_id' => '501', 'seller_sku' => 'MLS-DUP'],
        // duplicate key within one fetch must not break the upsert
        ['item_id' => '501', 'seller_sku' => 'MLS-DUP'],
    ]);

    $stats = mlsSync($shop);

    expect($stats['fetched'])->toBe(3)->and($stats['upserted'])->toBe(2)->and($stats['matched'])->toBe(2);
    expect(MarketplaceListing::where('product_id', $product->id)->count())->toBe(2);
});

test('data_changed_at moves only when a synced value changes, last_synced_at moves every sync', function () {
    $shop = mlsShop();
    $at = fn (string $field) => MarketplaceListing::where('item_id', '300')->first()->{$field}->toDateTimeString();

    $this->travelTo('2026-11-01 10:00:00');
    mlsFake([['item_id' => '300', 'seller_sku' => 'DC-1', 'price' => 100.0]]);
    mlsSync($shop);
    expect($at('data_changed_at'))->toBe('2026-11-01 10:00:00');

    $this->travelTo('2026-11-02 10:00:00');
    mlsFake([['item_id' => '300', 'seller_sku' => 'DC-1', 'price' => 100.0]]); // nothing changed
    mlsSync($shop);
    expect($at('data_changed_at'))->toBe('2026-11-01 10:00:00')
        ->and($at('last_synced_at'))->toBe('2026-11-02 10:00:00');

    $this->travelTo('2026-11-03 10:00:00');
    mlsFake([['item_id' => '300', 'seller_sku' => 'DC-1', 'price' => 89.0]]); // price changed
    mlsSync($shop);
    expect($at('data_changed_at'))->toBe('2026-11-03 10:00:00');
});
