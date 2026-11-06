<?php

use App\Http\Controllers\Catalog\ProductMatchingActionsController;
use App\Http\Controllers\Catalog\ProductMatchingController;
use App\Models\Attribute;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Models\MarketplaceListing;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\Marketplace\Listings\ListingScoreSuggester;
use App\Services\Marketplace\Listings\ProductMatchIndexBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Product Matching phase 3A — product_match_index build, stored score
 * suggestions (persist / recompute), accept of a stored suggestion and
 * bulk accept skipping them, page integration.
 */
function lssShop(): SalesPlatformShop
{
    $platform = SalesPlatform::firstOrCreate(['name' => 'Shopee'], ['code' => 'shopee_'.uniqid()]);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'LSS '.uniqid()]);
}

function lssListing(SalesPlatformShop $shop, array $attrs): MarketplaceListing
{
    return MarketplaceListing::create(array_merge([
        'sales_platform_shop_id' => $shop->id,
        'platform' => 'shopee',
        'item_id' => (string) random_int(1, 999999999),
        'variant_id' => '',
        'is_active' => true,
    ], $attrs));
}

/** PIM product with EAV pname (th + en), optional pbrand option and price_recommend */
function lssProduct(string $sku, string $nameTh, ?string $nameEn = null, ?string $brand = null, ?string $price = null): Product
{
    $th = Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'Thai', 'enabled' => true])->id;
    $en = Locale::firstOrCreate(['code' => 'en'], ['display_name' => 'English', 'enabled' => true])->id;
    $name = Attribute::firstOrCreate(['code' => 'pname'], ['type' => 'text', 'is_locale_based' => true])->id;
    $brandAttr = Attribute::firstOrCreate(['code' => 'pbrand'], ['type' => 'select', 'is_locale_based' => true]);
    $priceAttr = Attribute::firstOrCreate(['code' => 'price_recommend'], ['type' => 'price', 'is_locale_based' => true])->id;
    foreach (['pumpkin' => 'PUMPKIN', 'netto' => 'NETTO'] as $code => $label) {
        DB::table('attribute_options')->updateOrInsert(['attribute_id' => $brandAttr->id, 'code' => $code], ['admin_label' => $label]);
    }

    $product = Product::create(['sku' => $sku]);
    $rows = [
        ['attribute_id' => $name, 'locale_id' => $th, 'value' => $nameTh],
        ['attribute_id' => $name, 'locale_id' => $en, 'value' => $nameEn ?? $nameTh],
    ];
    if ($brand) {
        $rows[] = ['attribute_id' => $brandAttr->id, 'locale_id' => null, 'value' => $brand];
    }
    if ($price) {
        $rows[] = ['attribute_id' => $priceAttr, 'locale_id' => null, 'value' => $price];
    }
    foreach ($rows as $row) {
        DB::table('product_values')->insert($row + ['product_id' => $product->id, 'channel_id' => null]);
    }

    return $product;
}

function lssCall(User $user, string $action, array $data = [], ?MarketplaceListing $listing = null)
{
    test()->actingAs($user);
    $request = Request::create('/catalog/marketplace/product-matching/x', 'POST', $data);
    $request->setUserResolver(fn () => $user);
    $request->setLaravelSession(app('session.store'));
    $controller = app(ProductMatchingActionsController::class);

    return $listing ? $controller->{$action}($request, $listing) : $controller->{$action}($request);
}

beforeEach(function () {
    $this->shop = lssShop();
    $this->user = User::factory()->create();
    $this->laser = lssProduct('LSS-28363', 'PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร LDM-40AX', 'PUMPKIN Laser distance meter 40m LDM-40AX', 'pumpkin', '3290');
    $this->hammer = lssProduct('LSS-29215', 'NETTO ค้อนช่างทอง ด้ามไม้ 200 กรัม');
    $this->unrelated = lssProduct('LSS-44374', 'PUMPKIN เครื่องกำเนิดไฟฟ้าดีเซล silent type PTT-D5550ES', null, 'pumpkin');
    app(ProductMatchIndexBuilder::class)->rebuild();
});

test('the match index flattens EAV name / brand / price / model tokens per product', function () {
    $laser = DB::table('product_match_index')->where('product_id', $this->laser->id)->first();
    $hammer = DB::table('product_match_index')->where('product_id', $this->hammer->id)->first();

    expect($laser->sku)->toBe('LSS-28363')
        ->and($laser->name_th)->toBe('เครื่องวัดระยะเลเซอร์ 40 เมตร ldm 40ax') // brand + punctuation stripped
        ->and($laser->name_en)->toBe('laser distance meter 40m ldm 40ax')
        ->and($laser->brand_code)->toBe('pumpkin')
        ->and($laser->brand_label)->toBe('PUMPKIN')
        ->and((float) $laser->price)->toBe(3290.0)
        ->and($laser->model_tokens)->toContain(' LDM40AX ')
        ->and($laser->model_tokens)->toContain(' LSS28363 ');
    // no pbrand value → brand detected from the name
    expect($hammer->brand_code)->toBe('netto')->and($hammer->name_en)->toBeNull();
});

test('score suggestions are stored for unmatched listings without a rule suggestion, and recomputed', function () {
    $hit = lssListing($this->shop, ['seller_sku' => '99001', 'name' => '【ส่งฟรี】 PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร LDM-40AX ของแท้', 'price' => 3200]);
    $ruled = lssListing($this->shop, ['seller_sku' => 'LSS-28363.', 'name' => 'PUMPKIN เครื่องวัดระยะเลเซอร์ LDM-40AX']);
    $junk = lssListing($this->shop, ['seller_sku' => '99002', 'name' => 'สติกเกอร์ติดรถ ลายการ์ตูน']);
    $linked = lssListing($this->shop, ['seller_sku' => '99003', 'name' => 'PUMPKIN เครื่องวัดระยะเลเซอร์ LDM-40AX', 'product_id' => $this->laser->id, 'match_method' => 'manual']);

    $stats = app(ListingScoreSuggester::class)->computeForShop($this->shop->id);

    expect($stats['listings'])->toBe(3)->and($stats['considered'])->toBe(2)->and($stats['suggested'])->toBe(1);
    $rows = DB::table('marketplace_listing_suggestions')->orderBy('rank')->get();
    expect($rows)->toHaveCount(1)
        ->and($rows[0]->marketplace_listing_id)->toBe($hit->id)
        ->and($rows[0]->product_id)->toBe($this->laser->id)
        ->and($rows[0]->rank)->toBe(1)
        ->and($rows[0]->score)->toBeGreaterThanOrEqual(80);
    $reasons = json_decode($rows[0]->reasons, true);
    expect($reasons)->toContain('รหัสรุ่น LDM-40AX ตรง')->toContain('แบรนด์ PUMPKIN ตรง')->toContain('ราคาใกล้เคียง');
    expect(collect($reasons)->first(fn ($r) => str_starts_with($r, 'ชื่อคล้าย')))->not->toBeNull();

    // recompute replaces the shop's set: the listing got linked meanwhile
    $hit->forceFill(['product_id' => $this->laser->id, 'match_method' => 'manual'])->save();
    app(ListingScoreSuggester::class)->computeForShop($this->shop->id);
    expect(DB::table('marketplace_listing_suggestions')->count())->toBe(0);

    // deleting the product cascades its suggestion rows away
    $hit->forceFill(['product_id' => null, 'match_method' => null])->save();
    app(ListingScoreSuggester::class)->computeForShop($this->shop->id);
    expect(DB::table('marketplace_listing_suggestions')->count())->toBe(1);
    DB::table('product_match_index')->where('product_id', $this->laser->id)->delete();
    $this->laser->delete();
    expect(DB::table('marketplace_listing_suggestions')->count())->toBe(0);
});

test('a stored score suggestion can be accepted (match_method suggested); a stale one cannot', function () {
    $l = lssListing($this->shop, ['seller_sku' => '99001', 'name' => 'PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร LDM-40AX']);
    app(ListingScoreSuggester::class)->computeForShop($this->shop->id);

    // not in the stored list → refused, nothing linked
    lssCall($this->user, 'accept', ['type' => 'similar', 'product_id' => $this->hammer->id], $l);
    expect($l->fresh()->isLinked())->toBeFalse()->and(session('error'))->toContain('เปลี่ยนไปแล้ว');

    lssCall($this->user, 'accept', ['type' => 'similar', 'index' => 0, 'product_id' => $this->laser->id], $l);
    $l->refresh();
    expect($l->product_id)->toBe($this->laser->id)
        ->and($l->match_method)->toBe('suggested')
        ->and($l->pack_quantity)->toBeNull()
        ->and($l->matched_by)->toBe($this->user->id);
    $audit = AuditLog::where('event', 'marketplace_listing_linked')->where('auditable_id', $l->id)->latest('id')->first();
    expect($audit->new_values['suggestion_type'])->toBe('similar')
        ->and($audit->new_values['suggestion_score'])->toBeGreaterThan(0);
});

test('bulk accept never applies score-based (low confidence) suggestions', function () {
    $l = lssListing($this->shop, ['seller_sku' => '99001', 'name' => 'PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร LDM-40AX']);
    app(ListingScoreSuggester::class)->computeForShop($this->shop->id);
    expect(DB::table('marketplace_listing_suggestions')->where('marketplace_listing_id', $l->id)->exists())->toBeTrue();

    lssCall($this->user, 'bulkAccept', ['listing_ids' => [$l->id]]);

    expect($l->fresh()->isLinked())->toBeFalse()->and(session('warning'))->toContain('0 รายการ');
});

test('the page shows score suggestions in the suggested tab, after rule ones, filterable by min score', function () {
    $scored = lssListing($this->shop, ['seller_sku' => '99001', 'name' => 'PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร LDM-40AX']);
    lssListing($this->shop, ['seller_sku' => 'LSS-29215.', 'name' => 'ค้อน']);
    app(ListingScoreSuggester::class)->computeForShop($this->shop->id);

    $props = function (array $query) {
        $request = Request::create('/catalog/marketplace/product-matching', 'GET', $query + ['shop_id' => $this->shop->id, 'tab' => 'suggested']);
        $request->setUserResolver(fn () => $this->user);
        $response = app(ProductMatchingController::class)->index($request);

        return (fn () => $this->props)->call($response);
    };

    $p = $props([]);
    expect($p['summary']['suggested'])->toBe(2);
    $row = collect($p['rows']->items())->firstWhere('id', $scored->id);
    expect($row['suggestions'][0])->toMatchArray(['type' => 'similar', 'confidence' => 'low'])
        ->and($row['suggestions'][0]['items'][0]['sku'])->toBe('LSS-28363')
        ->and($row['suggestions'][0]['score'])->toBeGreaterThan(0)
        ->and($row['suggestions'][0]['reasons'])->not->toBeEmpty();

    $score = $row['suggestions'][0]['score'];
    DB::table('marketplace_listing_suggestions')->update(['score' => 55]);
    expect($props(['min_score' => 60])['summary']['suggested'])->toBe(1) // rule-based one stays
        ->and($props(['min_score' => 50])['summary']['suggested'])->toBe(2)
        ->and($score)->toBeInt();
});
