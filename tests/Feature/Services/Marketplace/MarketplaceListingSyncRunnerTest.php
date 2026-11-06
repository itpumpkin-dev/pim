<?php

use App\Http\Controllers\Catalog\ProductMatchingController;
use App\Jobs\SyncMarketplaceListingsJob;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingSyncRun;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\Marketplace\Listings\LazadaListingFetcher;
use App\Services\Marketplace\Listings\MarketplaceListingFetcher;
use App\Services\Marketplace\Listings\MarketplaceListingSyncRunner;
use App\Services\Marketplace\Listings\MarketplaceListingSyncSchedule;
use App\Services\Marketplace\Listings\WooCommerceListingFetcher;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;

/**
 * Product Matching phase 4A — sync runs (record / failure / stuck cleanup),
 * the per-shop lock, the button's "already syncing" answer and the nightly
 * schedule. A fake fetcher is bound in the container — no HTTP.
 */
function msrFetcher(array $rows, ?Throwable $throw = null): MarketplaceListingFetcher
{
    return new class($rows, $throw) implements MarketplaceListingFetcher
    {
        public int $calls = 0;

        public function __construct(private array $rows, private ?Throwable $throw) {}

        public function fetch(SalesPlatformShop $shop): iterable
        {
            $this->calls++;
            if ($this->throw) {
                throw $this->throw;
            }
            foreach ($this->rows as $row) {
                yield $row + ['variant_id' => '', 'seller_sku' => null, 'name' => null, 'status' => 'active', 'is_active' => true,
                    'price' => 100.0, 'quantity' => 1, 'image_url' => null, 'url' => null];
            }
        }

        public function incompleteItemIds(): array
        {
            return [];
        }
    };
}

function msrShop(string $platform = 'Lazada', array $attrs = []): SalesPlatformShop
{
    $p = SalesPlatform::firstOrCreate(['name' => $platform], ['code' => strtolower($platform).'_'.uniqid()]);

    return SalesPlatformShop::create(['sales_platform_id' => $p->id, 'code' => 'shop_'.uniqid(), 'name' => 'MSR '.uniqid()] + $attrs);
}

test('a run is recorded as success with the sync stats', function () {
    $shop = msrShop();
    Product::create(['sku' => 'MSR-1']);
    app()->bind(LazadaListingFetcher::class, fn () => msrFetcher([['item_id' => '1', 'seller_sku' => 'MSR-1'], ['item_id' => '2', 'seller_sku' => 'NOPE']]));

    $stats = app(MarketplaceListingSyncRunner::class)->run($shop->fresh(), 'manual');

    expect($stats)->toMatchArray(['fetched' => 2, 'matched' => 1, 'unmatched' => 1])
        ->and($stats)->toHaveKey('score_suggested');
    $run = MarketplaceListingSyncRun::sole();
    expect($run->sales_platform_shop_id)->toBe($shop->id)
        ->and($run->trigger)->toBe('manual')
        ->and($run->status)->toBe('success')
        ->and($run->finished_at)->not->toBeNull()
        ->and($run->duration_ms)->toBeGreaterThanOrEqual(0)
        ->and($run->stats['fetched'])->toBe(2)
        ->and($run->error)->toBeNull();
});

test('a failing sync is recorded as failed with the error and rethrown; the lock is released', function () {
    $shop = msrShop();
    app()->bind(LazadaListingFetcher::class, fn () => msrFetcher([], new RuntimeException('Lazada token expired')));

    expect(fn () => app(MarketplaceListingSyncRunner::class)->run($shop->fresh(), 'schedule'))->toThrow(RuntimeException::class);

    $run = MarketplaceListingSyncRun::sole();
    expect($run->status)->toBe('failed')->and($run->trigger)->toBe('schedule')->and($run->error)->toContain('token expired');
    expect(Cache::lock(MarketplaceListingSyncRunner::lockKey($shop->id), 10)->get())->toBeTrue();
});

test('runs stuck in running for more than 6h are marked failed at the start of a new run', function () {
    $shop = msrShop();
    $stuck = MarketplaceListingSyncRun::create(['sales_platform_shop_id' => $shop->id, 'trigger' => 'schedule', 'status' => 'running', 'started_at' => now()->subHours(7)]);
    $recent = MarketplaceListingSyncRun::create(['sales_platform_shop_id' => $shop->id, 'trigger' => 'manual', 'status' => 'running', 'started_at' => now()->subHour()]);
    $other = msrShop();
    app()->bind(LazadaListingFetcher::class, fn () => msrFetcher([['item_id' => '1']]));

    app(MarketplaceListingSyncRunner::class)->run($other->fresh(), 'command');

    expect($stuck->fresh()->status)->toBe('failed')
        ->and($stuck->fresh()->error)->toContain('6 ชั่วโมง')
        ->and($recent->fresh()->status)->toBe('running');
});

test('the per-shop lock prevents a concurrent sync of the same shop', function () {
    $shop = msrShop();
    $fake = msrFetcher([['item_id' => '1']]);
    app()->bind(LazadaListingFetcher::class, fn () => $fake);

    $held = Cache::lock(MarketplaceListingSyncRunner::lockKey($shop->id), 60);
    expect($held->get())->toBeTrue();

    expect(app(MarketplaceListingSyncRunner::class)->run($shop->fresh(), 'manual'))->toBeNull();
    expect($fake->calls)->toBe(0)->and(MarketplaceListingSyncRun::count())->toBe(0)
        ->and(MarketplaceListing::count())->toBe(0);

    // the queued job just skips quietly
    (new SyncMarketplaceListingsJob($shop->id))->handle(app(MarketplaceListingSyncRunner::class));
    expect($fake->calls)->toBe(0);

    $held->release();
    expect(app(MarketplaceListingSyncRunner::class)->run($shop->fresh(), 'manual'))->not->toBeNull();
    expect($fake->calls)->toBe(1);
});

test('the sync button answers "already syncing" instead of queueing again', function () {
    Queue::fake();
    $user = User::factory()->create();
    $shop = msrShop('Shopee');
    MarketplaceListingSyncRun::create(['sales_platform_shop_id' => $shop->id, 'trigger' => 'schedule', 'status' => 'running', 'started_at' => now()->subMinutes(5)]);

    $request = Request::create('/catalog/marketplace/product-matching/sync', 'POST', ['shop_id' => $shop->id]);
    $request->setUserResolver(fn () => $user);
    $request->setLaravelSession(app('session.store'));
    $this->actingAs($user);
    app(ProductMatchingController::class)->sync($request);

    Queue::assertNothingPushed();
    expect(session('warning'))->toContain('กำลังซิงค์');
});

test('the command records runs per shop and --linked-only skips shops without an account (WooCommerce always)', function () {
    $linked = msrShop('Lazada', ['lazada_seller_account_id' => 123]);
    $unlinked = msrShop('Lazada');
    $woo = msrShop('WooCommerce');
    app()->bind(LazadaListingFetcher::class, fn () => msrFetcher([['item_id' => '1']]));
    app()->bind(WooCommerceListingFetcher::class, fn () => msrFetcher([['item_id' => '2']]));

    $this->artisan('marketplace:sync-listings', ['--linked-only' => true, '--trigger' => 'schedule', '--shop' => [$linked->id, $unlinked->id, $woo->id]])
        ->assertSuccessful();

    expect(MarketplaceListingSyncRun::orderBy('sales_platform_shop_id')->pluck('sales_platform_shop_id')->all())->toBe([$linked->id, $woo->id])
        ->and(MarketplaceListingSyncRun::pluck('trigger')->unique()->all())->toBe(['schedule']);
});

test('the nightly schedule is registered from config (time, timezone, overlap guard) and can be switched off', function () {
    config(['services.marketplace_listing_sync' => ['schedule_enabled' => true, 'schedule_time' => '03:30', 'timezone' => 'Asia/Bangkok']]);
    $schedule = new Schedule('UTC');
    $event = MarketplaceListingSyncSchedule::register($schedule);

    expect($event)->not->toBeNull()
        ->and($event->expression)->toBe('30 3 * * *')
        ->and($event->timezone)->toBe('Asia/Bangkok')
        ->and($event->withoutOverlapping)->toBeTrue()
        ->and($event->expiresAt)->toBe(360)
        ->and($event->runInBackground)->toBeTrue()
        ->and($event->onOneServer)->toBeTrue()
        ->and($event->command)->toContain('marketplace:sync-listings --trigger=schedule --linked-only')
        ->and($event->output)->toEndWith('marketplace-sync.log');

    config(['services.marketplace_listing_sync.schedule_enabled' => false]);
    expect(MarketplaceListingSyncSchedule::register(new Schedule('UTC')))->toBeNull();

    // the app's own schedule (routes/console.php) has it at the default 02:00 Bangkok
    $registered = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains((string) $e->command, 'marketplace:sync-listings'));
    expect($registered)->not->toBeNull()
        ->and($registered->expression)->toBe('0 2 * * *')
        ->and($registered->timezone)->toBe('Asia/Bangkok');
});
