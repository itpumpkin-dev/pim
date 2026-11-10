<?php

use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingComponent;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\Marketplace\Listings\ProductMatchStatus;

/**
 * "จับคู่แล้ว" ✓ column of the per-platform Product Mapping tables.
 */
function pmsShop(string $code, string $name): SalesPlatformShop
{
    $platform = SalesPlatform::firstOrCreate(['code' => $code], ['name' => ucfirst($code)]);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => $name]);
}

function pmsListing(SalesPlatformShop $shop, array $attrs): MarketplaceListing
{
    return MarketplaceListing::create(array_merge([
        'sales_platform_shop_id' => $shop->id,
        'platform' => 'shopee',
        'item_id' => uniqid(),
        'variant_id' => '',
        'is_active' => true,
    ], $attrs));
}

test('flags products linked directly, via a variant or as a bundle component on the platform\'s shops', function () {
    $user = User::factory()->create();
    $shopA = pmsShop('shopee', 'PMS Shop B');
    $shopB = pmsShop('shopee', 'PMS Shop A');
    $lazada = pmsShop('lazada', 'PMS Lazada');

    $direct = Product::create(['sku' => 'PMS-DIRECT']);
    $parent = Product::create(['sku' => 'PMS-PARENT']);
    $variant = Product::create(['sku' => 'PMS-VARIANT', 'parent_id' => $parent->id]);
    $bundled = Product::create(['sku' => 'PMS-BUNDLED']);
    $otherPlatform = Product::create(['sku' => 'PMS-LAZADA-ONLY']);
    $unmatched = Product::create(['sku' => 'PMS-NONE']);

    pmsListing($shopA, ['product_id' => $direct->id, 'match_method' => 'manual']);
    pmsListing($shopB, ['product_id' => $direct->id, 'match_method' => 'auto_sku']);
    pmsListing($shopA, ['product_id' => $variant->id, 'match_method' => 'manual']);
    $bundle = pmsListing($shopA, ['match_method' => 'bundle']);
    MarketplaceListingComponent::create(['marketplace_listing_id' => $bundle->id, 'product_id' => $bundled->id, 'quantity' => 2]);
    pmsListing($lazada, ['platform' => 'lazada', 'product_id' => $otherPlatform->id, 'match_method' => 'manual']);
    pmsListing($shopA, ['seller_sku' => 'PMS-NONE']); // unlinked

    $products = Product::whereNull('parent_id')->where('sku', 'like', 'PMS-%')->with('variants:id,parent_id')->get();
    $matched = ProductMatchStatus::matchedShopsByProduct($products, 'shopee', $user);

    expect($matched[$direct->id])->toBe(['PMS Shop A', 'PMS Shop B'])
        ->and($matched[$parent->id])->toBe(['PMS Shop B'])
        ->and($matched[$bundled->id])->toBe(['PMS Shop B'])
        ->and($matched)->not->toHaveKey($otherPlatform->id)
        ->and($matched)->not->toHaveKey($unmatched->id);

    expect(ProductMatchStatus::matchedShopsByProduct($products, 'lazada', $user))
        ->toBe([$otherPlatform->id => ['PMS Lazada']]);
});

test('the ✓ disappears once the link is removed (Product Matching "ยกเลิกการผูก")', function () {
    $user = User::factory()->create();
    $shop = pmsShop('shopee', 'PMS Unlink');
    $product = Product::create(['sku' => 'PMS-UNLINK']);
    $listing = pmsListing($shop, ['product_id' => $product->id, 'match_method' => 'manual']);
    $products = Product::whereKey($product->id)->with('variants:id,parent_id')->get();

    expect(ProductMatchStatus::matchedShopsByProduct($products, 'shopee', $user))->toHaveKey($product->id);

    // same columns ProductMatchingActionsController::unlink() clears
    $listing->components()->delete();
    $listing->forceFill(['product_id' => null, 'pack_quantity' => null, 'match_method' => null, 'matched_at' => null, 'matched_by' => null])->save();

    expect(ProductMatchStatus::matchedShopsByProduct($products, 'shopee', $user))->toBe([])
        ->and(ProductMatchStatus::matchedShopsByProduct($products, null, $user))->toBe([]);
});

test('matchedListingsByProduct returns one entry per (shop, item) for the detail button', function () {
    $user = User::factory()->create();
    $shop = pmsShop('shopee', 'PMS Detail');
    $parent = Product::create(['sku' => 'PMS-DETAIL']);
    $v1 = Product::create(['sku' => 'PMS-DETAIL-1', 'parent_id' => $parent->id]);
    $v2 = Product::create(['sku' => 'PMS-DETAIL-2', 'parent_id' => $parent->id]);
    // two variant rows of the same item → one entry
    $first = pmsListing($shop, ['item_id' => '555', 'variant_id' => 'a', 'seller_sku' => 'PMS-DETAIL-1', 'product_id' => $v1->id, 'match_method' => 'manual']);
    pmsListing($shop, ['item_id' => '555', 'variant_id' => 'b', 'seller_sku' => 'PMS-DETAIL-2', 'product_id' => $v2->id, 'match_method' => 'manual']);

    $products = Product::whereKey($parent->id)->with('variants:id,parent_id')->get();
    $listings = ProductMatchStatus::matchedListingsByProduct($products, 'shopee', $user)[$parent->id];

    expect($listings)->toHaveCount(1)
        ->and($listings[0])->toMatchArray(['id' => $first->id, 'item_id' => '555', 'seller_sku' => 'PMS-DETAIL-1', 'shop' => 'PMS Detail']);
});
