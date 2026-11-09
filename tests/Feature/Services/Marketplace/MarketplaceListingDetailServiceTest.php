<?php

use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\Details\LazadaListingDetailFetcher;
use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailFetcher;
use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailService;
use Illuminate\Support\Facades\Cache;

/**
 * marketplace_listing_details cache-or-fetch: TTL / force, a failed fetch
 * keeps the previous good data, the per-item lock, fetchMany and the bulk
 * command. A fake fetcher is bound in the container — no HTTP.
 */
function mldsFetcher(): MarketplaceListingDetailFetcher
{
    return new class implements MarketplaceListingDetailFetcher
    {
        public int $calls = 0;

        public ?Throwable $throw = null;

        public string $name = 'Detail v1';

        public function fetch(SalesPlatformShop $shop, string $itemId): array
        {
            $this->calls++;
            if ($this->throw) {
                throw $this->throw;
            }

            return $this->parse(['/product/item/get' => ['data' => ['item_id' => $itemId]]]);
        }

        public function parse(array $raw, array $context = []): array
        {
            return [
                'name' => $this->name, 'description' => '<p>d</p>', 'description_text' => 'd', 'brand_id' => null, 'brand_name' => 'PUMPKIN',
                'category_id' => '1', 'category_name' => null, 'images' => ['https://x/1.jpg'], 'video_url' => null,
                'attributes' => [['id' => 'm', 'name' => 'material', 'values' => ['steel']]],
                'package' => ['weight_kg' => 1.0, 'length_cm' => null, 'width_cm' => null, 'height_cm' => null],
                'variants' => [['variant_id' => '9', 'seller_sku' => 'S1', 'name' => null, 'options' => [], 'price' => 10.0, 'special_price' => null, 'quantity' => 1, 'status' => 'active', 'image' => null]],
                'status' => 'Active', 'listing_url' => 'https://x', 'raw' => $raw,
            ];
        }
    };
}

function mldsShop(string $platform = 'Lazada'): SalesPlatformShop
{
    $p = SalesPlatform::firstOrCreate(['name' => $platform], ['code' => strtolower($platform).'_'.uniqid()]);

    return SalesPlatformShop::create(['sales_platform_id' => $p->id, 'code' => 'shop_'.uniqid(), 'name' => 'MLDS '.uniqid()]);
}

beforeEach(function () {
    $this->fake = mldsFetcher();
    app()->instance(LazadaListingDetailFetcher::class, $this->fake);
    $this->service = app(MarketplaceListingDetailService::class);
    $this->shop = mldsShop();
});

test('fetch stores the normalised detail, then serves it from the table until the TTL runs out', function () {
    $d = $this->service->fetch($this->shop, '111');

    expect($this->fake->calls)->toBe(1)
        ->and($d->exists)->toBeTrue()
        ->and($d->platform)->toBe('lazada')
        ->and($d->name)->toBe('Detail v1')
        ->and($d->getAttribute('attributes'))->toBe([['id' => 'm', 'name' => 'material', 'values' => ['steel']]])
        ->and($d->variants[0]['seller_sku'])->toBe('S1')
        ->and($d->raw)->toHaveKey('/product/item/get')
        ->and($d->fetched_at)->not->toBeNull()
        ->and($d->fetch_error)->toBeNull()
        ->and($d->fetch_duration_ms)->toBeInt();

    $this->service->fetch($this->shop, '111');
    expect($this->fake->calls)->toBe(1); // fresh → no API call

    $this->travel(25)->hours();
    $this->fake->name = 'Detail v2';
    $again = $this->service->fetch($this->shop, '111');
    expect($this->fake->calls)->toBe(2)
        ->and($again->name)->toBe('Detail v2')
        ->and(MarketplaceListingDetail::count())->toBe(1);
});

test('the TTL comes from config and force always re-fetches', function () {
    config(['services.marketplace_listing_details.ttl_hours' => 1]);
    $this->service->fetch($this->shop, '111');
    $this->travel(2)->hours();
    $this->service->fetch($this->shop, '111');
    expect($this->fake->calls)->toBe(2);

    $this->travel(1)->minutes();
    $this->service->fetch($this->shop, '111', force: true);
    expect($this->fake->calls)->toBe(3);
});

test('a failed fetch keeps the previous good data and records the error', function () {
    $good = $this->service->fetch($this->shop, '111');
    $fetchedAt = $good->fetched_at->toIso8601String();

    $this->travel(1)->minutes();
    $this->fake->throw = new RuntimeException('Lazada API error [IllegalAccessToken]: token expired');
    $failed = $this->service->fetch($this->shop, '111', force: true);

    expect($failed->id)->toBe($good->id)
        ->and($failed->name)->toBe('Detail v1')
        ->and($failed->variants)->toHaveCount(1)
        ->and($failed->fetched_at->toIso8601String())->toBe($fetchedAt)
        ->and($failed->fetch_error)->toContain('token expired')
        ->and($failed->hasData())->toBeTrue();

    // the next successful fetch clears the error
    $this->fake->throw = null;
    $this->travel(1)->minutes();
    expect($this->service->fetch($this->shop, '111', force: true)->fetch_error)->toBeNull();
});

test('a failed first fetch stores an error-only row (no data) and the next open retries', function () {
    $this->fake->throw = new RuntimeException('Lazada item 222 not found.');
    $d = $this->service->fetch($this->shop, '222');

    expect($d->exists)->toBeTrue()
        ->and($d->hasData())->toBeFalse()
        ->and($d->name)->toBeNull()
        ->and($d->platform)->toBe('lazada')
        ->and($d->fetch_error)->toBe('Lazada item 222 not found.');

    $this->fake->throw = null;
    $this->travel(1)->seconds();
    expect($this->service->fetch($this->shop, '222')->hasData())->toBeTrue()
        ->and($this->fake->calls)->toBe(2);
});

test('while another request holds the item lock, no second API call is made', function () {
    $this->service->lockWaitSeconds = 0;
    $this->service->fetch($this->shop, '333');
    $this->travel(25)->hours(); // stale

    $lock = Cache::lock("marketplace_listing_detail:{$this->shop->id}:333", 10);
    expect($lock->get())->toBeTrue();

    // stale row + lock busy → the stored row, no fetch
    $d = $this->service->fetch($this->shop, '333', force: true);
    expect($this->fake->calls)->toBe(1)->and($d->name)->toBe('Detail v1');

    // nothing stored yet + lock busy → an unsaved placeholder with a message
    $other = Cache::lock("marketplace_listing_detail:{$this->shop->id}:444", 10);
    $other->get();
    $placeholder = $this->service->fetch($this->shop, '444');
    expect($placeholder->exists)->toBeFalse()
        ->and($placeholder->fetch_error)->toContain('กำลังดึงข้อมูล')
        ->and(MarketplaceListingDetail::where('item_id', '444')->exists())->toBeFalse()
        ->and($this->fake->calls)->toBe(1);

    $lock->release();
    $other->release();
    $this->service->fetch($this->shop, '333');
    expect($this->fake->calls)->toBe(2);
});

test('fetchMany skips fresh items, counts failures and keeps going', function () {
    $this->service->fetch($this->shop, '1');
    $seen = [];

    $stats = $this->service->fetchMany($this->shop, ['1', '2', '3'], onItem: function ($id, $detail, $outcome) use (&$seen) {
        $seen[$id] = $outcome;
    });

    expect($stats)->toBe(['fetched' => 2, 'cached' => 1, 'failed' => 0])
        ->and($seen)->toBe(['1' => 'cached', '2' => 'fetched', '3' => 'fetched'])
        ->and($this->fake->calls)->toBe(3);

    $this->fake->throw = new RuntimeException('boom');
    expect($this->service->fetchMany($this->shop, ['4', '5']))->toBe(['fetched' => 0, 'cached' => 0, 'failed' => 2]);
});

test('MarketplaceListing::detail() matches on shop + item id', function () {
    $other = mldsShop();
    $this->service->fetch($this->shop, '777');
    $this->service->fetch($other, '777');

    $listing = MarketplaceListing::create(['sales_platform_shop_id' => $this->shop->id, 'platform' => 'lazada', 'item_id' => '777', 'variant_id' => '9', 'is_active' => true]);

    expect($listing->detail->sales_platform_shop_id)->toBe($this->shop->id)
        ->and($this->shop->marketplaceListingDetails()->count())->toBe(1)
        ->and(MarketplaceListingDetail::count())->toBe(2);
});

test('the bulk command fetches the shop\'s distinct items with --limit / --only-missing', function () {
    foreach (['10' => ['a', 'b'], '20' => [''], '30' => ['']] as $item => $variants) {
        foreach ($variants as $v) {
            MarketplaceListing::create(['sales_platform_shop_id' => $this->shop->id, 'platform' => 'lazada', 'item_id' => $item, 'variant_id' => $v, 'is_active' => true]);
        }
    }

    $this->artisan('marketplace:fetch-listing-details', ['--shop' => [$this->shop->id], '--limit' => 2, '--sleep-ms' => 0])->assertSuccessful();
    expect(MarketplaceListingDetail::orderBy('item_id')->pluck('item_id')->all())->toBe(['10', '20'])
        ->and($this->fake->calls)->toBe(2);

    $this->artisan('marketplace:fetch-listing-details', ['--shop' => [$this->shop->id], '--only-missing' => true, '--sleep-ms' => 0])->assertSuccessful();
    expect(MarketplaceListingDetail::count())->toBe(3)
        ->and($this->fake->calls)->toBe(3);

    $this->fake->throw = new RuntimeException('down');
    $this->artisan('marketplace:fetch-listing-details', ['--shop' => [$this->shop->id], '--force' => true, '--sleep-ms' => 0])->assertFailed();
    expect(MarketplaceListingDetail::whereNotNull('fetch_error')->count())->toBe(3)
        ->and(MarketplaceListingDetail::whereNotNull('fetched_at')->count())->toBe(3);
});
