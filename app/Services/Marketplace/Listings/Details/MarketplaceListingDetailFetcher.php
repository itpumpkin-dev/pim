<?php

namespace App\Services\Marketplace\Listings\Details;

use App\Models\SalesPlatformShop;

/**
 * Reads the full product detail of ONE marketplace listing item — READ-ONLY
 * API calls only — and normalises it to the marketplace_listing_details
 * shape (identical for every platform):
 *
 *   name ?string, description ?string (as received), description_text
 *   ?string (plain text with line breaks), brand_id ?string, brand_name
 *   ?string, category_id ?string, category_name ?string, images string[],
 *   video_url ?string, attributes [{id ?string, name string, values
 *   string[]}], package {weight_kg ?float, length_cm ?float, width_cm
 *   ?float, height_cm ?float}, variants [{variant_id string, seller_sku
 *   ?string, name ?string, options {name: value}, price ?float,
 *   special_price ?float, quantity ?int, status ?string, image ?string}],
 *   status ?string, listing_url ?string, raw {endpoint: response}
 *
 * fetch() throws on an API/auth/network failure or when the item doesn't
 * exist; parse() never throws on a missing optional field.
 */
interface MarketplaceListingDetailFetcher
{
    /**
     * @return array<string, mixed> the normalised detail + 'raw'
     */
    public function fetch(SalesPlatformShop $shop, string $itemId): array;

    /**
     * Normalises already-fetched raw responses (keyed by endpoint, the same
     * array fetch() stores in 'raw'). $context carries what isn't in the
     * responses (e.g. Shopee's shop id for the URL, WooCommerce's units).
     *
     * @param  array<string, mixed>  $raw
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function parse(array $raw, array $context = []): array;
}
