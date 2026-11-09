<?php

namespace App\Services\Marketplace\Listings\Details;

use App\Models\SalesPlatformShop;
use App\Services\WooCommerce\WooCommerceClient;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * WooCommerce (site-wide store, no per-shop account):
 * WooCommerceClient::getProductOrFail(id) (GET /products/{id}) +
 * listVariations(id) pages for `type: variable` products — all confirmed
 * live 2026-11-09.
 *
 * Units: weight / dimensions are bare numbers in the STORE's units —
 * read once a day from GET /settings/products/woocommerce_weight_unit and
 * woocommerce_dimension_unit (cached; kg / cm assumed if that call fails)
 * and stored in raw['settings'] so a re-parse doesn't need the API.
 *
 * raw: the product and variation responses WITHOUT `meta_data` / `_links`
 * (plugin internals, ~80% of the payload — 200+ meta rows per product on
 * this store), otherwise untouched.
 *
 * Category: WooCommerce products carry a flat list of categories (no
 * hierarchy in the response) — the last one is used as category_id/name
 * and the full list is kept as a "หมวดหมู่ทั้งหมด" attribute row.
 */
class WooCommerceListingDetailFetcher extends AbstractListingDetailFetcher
{
    public const PRODUCT = 'product';

    public const VARIATIONS = 'variations';

    public const SETTINGS = 'settings';

    private const VARIATION_PAGE = 100;

    private const STRIP_KEYS = ['meta_data', '_links'];

    public function fetch(SalesPlatformShop $shop, string $itemId): array
    {
        if (! ctype_digit($itemId)) {
            throw new InvalidArgumentException("Invalid WooCommerce product id '{$itemId}'.");
        }

        $client = new WooCommerceClient;
        $product = $this->strip($client->getProductOrFail((int) $itemId));

        $raw = [self::PRODUCT => $product, self::SETTINGS => $this->units($client)];
        if (($product['type'] ?? null) === 'variable') {
            $variations = [];
            $page = 1;
            do {
                $rows = $client->listVariations((int) $itemId, $page, self::VARIATION_PAGE);
                $rows = array_is_list($rows) ? $rows : [];
                foreach ($rows as $row) {
                    $variations[] = is_array($row) ? $this->strip($row) : $row;
                }
                $page++;
            } while (count($rows) >= self::VARIATION_PAGE);
            $raw[self::VARIATIONS] = $variations;
        }

        return $this->parse($raw);
    }

    public function parse(array $raw, array $context = []): array
    {
        $product = $this->arr($raw[self::PRODUCT] ?? null);
        $settings = $this->arr($raw[self::SETTINGS] ?? null) + ($context['units'] ?? []) + ['weight_unit' => 'kg', 'dimension_unit' => 'cm'];
        $weightUnit = (string) $settings['weight_unit'];
        $dimUnit = (string) $settings['dimension_unit'];

        $categories = array_values(array_filter($this->arr($product['categories'] ?? null), 'is_array'));
        $category = $categories[count($categories) - 1] ?? null;
        $brand = $this->arr($this->arr($product['brands'] ?? null)[0] ?? null);

        $attributes = [];
        foreach ($this->arr($product['attributes'] ?? null) as $attr) {
            if (! is_array($attr)) {
                continue;
            }
            $id = $attr['id'] ?? null;
            if ($a = $this->attribute(! empty($id) ? $id : ($attr['slug'] ?? null), $attr['name'] ?? null, $this->arr($attr['options'] ?? null))) {
                $attributes[] = $a;
            }
        }
        if (count($categories) > 1) {
            $attributes[] = $this->attribute('categories', 'หมวดหมู่ทั้งหมด', array_map(fn ($c) => $c['name'] ?? null, $categories));
        }
        // brand plugin missing → fall back to a "brand" product attribute
        $brandName = $this->str($brand['name'] ?? null);
        foreach ($attributes as $a) {
            if ($brandName === null && in_array(mb_strtolower($a['name']), ['brand', 'แบรนด์', 'ยี่ห้อ'], true)) {
                $brandName = $a['values'][0];
            }
        }

        $images = [];
        foreach ($this->arr($product['images'] ?? null) as $image) {
            if (is_array($image)) {
                $images[] = $this->str($image['src'] ?? null);
            }
        }

        $dims = $this->arr($product['dimensions'] ?? null);
        $short = $this->str($product['short_description'] ?? null);
        $long = $this->str($product['description'] ?? null);

        if (array_key_exists(self::VARIATIONS, $raw)) {
            $variants = [];
            foreach ($this->arr($raw[self::VARIATIONS]) as $variation) {
                if (is_array($variation) && ! empty($variation['id'])) {
                    $variants[] = $this->wooVariant($variation, $variation['id']);
                }
            }
        } else {
            $variants = [$this->wooVariant($product, '')];
        }

        return $this->result([
            'name' => $this->str($product['name'] ?? null),
            'description' => $long ?? $short,
            'description_text' => $this->joinText(self::htmlToText($short), self::htmlToText($long)),
            'brand_id' => $this->str($brand['id'] ?? null),
            'brand_name' => $brandName,
            'category_id' => $this->str($category['id'] ?? null),
            'category_name' => $this->str(is_string($category['name'] ?? null) ? html_entity_decode($category['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8') : null),
            'images' => $images,
            'video_url' => null,
            'attributes' => array_values(array_filter($attributes)),
            'package' => $this->package(
                $this->toKg($product['weight'] ?? null, $weightUnit),
                $this->toCm($dims['length'] ?? null, $dimUnit),
                $this->toCm($dims['width'] ?? null, $dimUnit),
                $this->toCm($dims['height'] ?? null, $dimUnit),
            ),
            'variants' => $variants,
            'status' => $this->str($product['status'] ?? null),
            'listing_url' => $this->str($product['permalink'] ?? null),
            'raw' => $raw,
        ]);
    }

    private function wooVariant(array $entry, mixed $variantId): array
    {
        $options = [];
        foreach ($this->arr($entry['attributes'] ?? null) as $attr) {
            if (is_array($attr) && ($name = $this->str($attr['name'] ?? null)) !== null) {
                $options[$name] = $attr['option'] ?? null;
            }
        }
        $regular = $this->num($entry['regular_price'] ?? null) ?? $this->num($entry['price'] ?? null);

        return $this->variant(
            $variantId,
            $entry['sku'] ?? null,
            $options,
            $regular,
            $entry['sale_price'] ?? null,
            $entry['stock_quantity'] ?? null,
            $entry['status'] ?? null,
            is_array($entry['image'] ?? null) ? ($entry['image']['src'] ?? null) : null,
        );
    }

    private function strip(array $response): array
    {
        return array_diff_key($response, array_flip(self::STRIP_KEYS));
    }

    /**
     * @return array{weight_unit: string, dimension_unit: string}
     */
    private function units(WooCommerceClient $client): array
    {
        try {
            return Cache::remember('marketplace_listing_details.woocommerce_units', now()->addDay(), fn () => [
                'weight_unit' => (string) ($client->getProductSetting('woocommerce_weight_unit')['value'] ?? 'kg'),
                'dimension_unit' => (string) ($client->getProductSetting('woocommerce_dimension_unit')['value'] ?? 'cm'),
            ]);
        } catch (\Throwable $e) {
            Log::warning('WooCommerce listing detail: unit settings unreadable, assuming kg/cm', ['error' => $e->getMessage()]);

            return ['weight_unit' => 'kg', 'dimension_unit' => 'cm'];
        }
    }
}
