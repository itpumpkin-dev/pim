<?php

namespace App\Services\Marketplace\Listings\Details;

use App\Models\SalesPlatformShop;
use App\Services\TikTok\TikTokClient;
use InvalidArgumentException;
use RuntimeException;

/**
 * TikTok Shop: one call — TikTokClient::getProduct() (GET
 * /product/202309/products/{id}, confirmed live 2026-11-09). Source units are
 * given explicitly: package_weight {value, unit KILOGRAM|GRAM|POUND|...},
 * package_dimensions {length, width, height, unit CENTIMETER|INCH|...} —
 * converted to kg / cm. Category name = local_name of the leaf in
 * category_chains (Thai). The API returns no storefront URL, so
 * listing_url stays null (same as the listing sync).
 */
class TikTokListingDetailFetcher extends AbstractListingDetailFetcher
{
    public const ENDPOINT = 'get_product';

    public function fetch(SalesPlatformShop $shop, string $itemId): array
    {
        if (! ctype_digit($itemId)) {
            throw new InvalidArgumentException("Invalid TikTok product id '{$itemId}'.");
        }
        $account = $shop->tiktokAccount();
        if (! $account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked TikTok account.");
        }

        $response = (new TikTokClient($account))->getProduct($itemId);
        if (! is_array($response['data'] ?? null) || (string) ($response['data']['id'] ?? '') !== $itemId) {
            throw new RuntimeException("TikTok product {$itemId} not found.");
        }

        return $this->parse([self::ENDPOINT => $response]);
    }

    public function parse(array $raw, array $context = []): array
    {
        $data = $this->arr($raw[self::ENDPOINT]['data'] ?? null);

        $chain = array_values(array_filter($this->arr($data['category_chains'] ?? null), 'is_array'));
        $leaf = null;
        foreach ($chain as $node) {
            if (! empty($node['is_leaf'])) {
                $leaf = $node;
            }
        }
        $leaf ??= $chain[count($chain) - 1] ?? null;

        $images = [];
        foreach ($this->arr($data['main_images'] ?? null) as $image) {
            if (is_array($image) && ($url = $this->str($this->arr($image['urls'] ?? null)[0] ?? null)) !== null) {
                $images[] = $url;
            }
        }

        $attributes = [];
        foreach ($this->arr($data['product_attributes'] ?? null) as $attr) {
            if (! is_array($attr)) {
                continue;
            }
            $values = array_map(fn ($v) => is_array($v) ? ($v['name'] ?? null) : null, $this->arr($attr['values'] ?? null));
            if ($a = $this->attribute($attr['id'] ?? null, $attr['name'] ?? null, $values)) {
                $attributes[] = $a;
            }
        }

        $weight = $this->arr($data['package_weight'] ?? null);
        $dims = $this->arr($data['package_dimensions'] ?? null);
        $dimUnit = $this->str($dims['unit'] ?? null);

        $variants = [];
        foreach ($this->arr($data['skus'] ?? null) as $sku) {
            if (! is_array($sku) || empty($sku['id'])) {
                continue;
            }
            $options = [];
            $image = null;
            foreach ($this->arr($sku['sales_attributes'] ?? null) as $i => $sa) {
                if (! is_array($sa)) {
                    continue;
                }
                $name = $this->str($sa['name'] ?? null) ?? 'ตัวเลือก '.($i + 1);
                $options[$name] = $sa['value_name'] ?? null;
                $image ??= $this->str($this->arr($sa['sku_img']['urls'] ?? null)[0] ?? null);
            }
            $quantity = null;
            foreach ($this->arr($sku['inventory'] ?? null) as $inventory) {
                if (is_array($inventory) && is_numeric($inventory['quantity'] ?? null)) {
                    $quantity = ($quantity ?? 0) + (int) $inventory['quantity'];
                }
            }
            $price = $this->arr($sku['price'] ?? null);

            $variants[] = $this->variant(
                $sku['id'],
                $sku['seller_sku'] ?? null,
                $options,
                $price['sale_price'] ?? ($price['tax_exclusive_price'] ?? null),
                null,
                $quantity,
                $sku['status_info']['status'] ?? null,
                $image,
            );
        }

        return $this->result([
            'name' => $this->str($data['title'] ?? null),
            'description' => $this->str($data['description'] ?? null),
            'description_text' => self::htmlToText($this->str($data['description'] ?? null)),
            'brand_id' => $this->str($data['brand']['id'] ?? null),
            'brand_name' => $this->str($data['brand']['name'] ?? null),
            'category_id' => $this->str($leaf['id'] ?? null),
            'category_name' => $this->str($leaf['local_name'] ?? null),
            'images' => $images,
            'video_url' => $this->str($data['video']['url'] ?? null),
            'attributes' => $attributes,
            'package' => $this->package(
                $this->toKg($weight['value'] ?? null, $this->str($weight['unit'] ?? null)),
                $this->toCm($dims['length'] ?? null, $dimUnit),
                $this->toCm($dims['width'] ?? null, $dimUnit),
                $this->toCm($dims['height'] ?? null, $dimUnit),
            ),
            'variants' => $variants,
            'status' => $this->str($data['status'] ?? null),
            'listing_url' => null,
            'raw' => $raw,
        ]);
    }
}
