<?php

namespace App\Services\Marketplace\Listings\Details;

use App\Models\LazadaAttribute;
use App\Models\LazadaCategory;
use App\Models\SalesPlatformShop;
use App\Services\Lazada\LazadaClient;
use InvalidArgumentException;
use RuntimeException;

/**
 * Lazada: one call — LazadaClient::getProductItem() (`/product/item/get`,
 * confirmed live 2026-11-09). Source units: package_weight kg,
 * package_length/width/height cm (strings, per SKU — the item's package is
 * taken from the first SKU that has one). Brand comes as a name only
 * (attributes.brand); category as primary_category id, named from our
 * synced lazada_categories table (English names). Every other key of
 * `attributes` (material, measuring_type, ...) becomes an attribute row named
 * by its Lazada key.
 */
class LazadaListingDetailFetcher extends AbstractListingDetailFetcher
{
    public const ENDPOINT = '/product/item/get';

    /** keys of data.attributes that are mapped to their own column (or are noise) */
    private const NON_ATTRIBUTE_KEYS = [
        'name', 'name_en', 'description', 'description_en', 'short_description', 'short_description_en',
        'brand', 'brand_id', 'source', 'video',
    ];

    public function fetch(SalesPlatformShop $shop, string $itemId): array
    {
        if (! ctype_digit($itemId)) {
            throw new InvalidArgumentException("Invalid Lazada item id '{$itemId}'.");
        }
        $account = $shop->lazadaAccount();
        if (! $account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked Lazada account.");
        }

        $response = (new LazadaClient($account))->getProductItem((int) $itemId);
        if (! is_array($response['data'] ?? null) || empty($response['data']['item_id'])) {
            throw new RuntimeException("Lazada item {$itemId} not found.");
        }

        return $this->parse([self::ENDPOINT => $response]);
    }

    public function parse(array $raw, array $context = []): array
    {
        $data = $this->arr($raw[self::ENDPOINT]['data'] ?? null);
        $attrs = $this->arr($data['attributes'] ?? null);
        $skus = array_values(array_filter($this->arr($data['skus'] ?? null), 'is_array'));

        $description = $this->str($attrs['description'] ?? null) ?? $this->str($attrs['short_description'] ?? null);
        $categoryId = $this->str($data['primary_category'] ?? null);

        // variation name => label (Variation1: {name: color_family, label: Color family})
        $labels = [];
        foreach ($this->arr($data['variation'] ?? null) as $variation) {
            if (is_array($variation) && ($n = $this->str($variation['name'] ?? null)) !== null) {
                $labels[$n] = $this->str($variation['label'] ?? null) ?? $n;
            }
        }

        $attributeKeys = array_values(array_diff(array_map('strval', array_keys($attrs)), self::NON_ATTRIBUTE_KEYS));
        $attributeLabels = $this->attributeLabels($attributeKeys);

        $attributes = [];
        foreach ($attrs as $key => $value) {
            if (in_array($key, self::NON_ATTRIBUTE_KEYS, true)) {
                continue;
            }
            $values = is_array($value) ? array_filter($value, 'is_scalar') : [$value];
            $values = array_map(fn ($v) => is_string($v) && str_contains($v, '<') ? self::htmlToText($v) : $v, $values);
            if ($attribute = $this->attribute($key, $attributeLabels[$key] ?? $key, $values)) {
                $attributes[] = $attribute;
            }
        }

        $variants = [];
        $package = null;
        $listingUrl = null;
        foreach ($skus as $sku) {
            $options = [];
            foreach ($this->arr($sku['saleProp'] ?? null) as $prop => $value) {
                $options[$labels[$prop] ?? (string) $prop] = $value;
            }
            $variants[] = $this->variant(
                $sku['SkuId'] ?? ($sku['ShopSku'] ?? null),
                $sku['SellerSku'] ?? null,
                $options,
                $sku['price'] ?? null,
                $sku['special_price'] ?? null,
                $sku['quantity'] ?? ($sku['Available'] ?? null),
                $sku['Status'] ?? null,
                $this->arr($sku['Images'] ?? null)[0] ?? null,
            );

            $listingUrl ??= $this->str($sku['Url'] ?? null);
            $candidate = $this->package(
                $this->num($sku['package_weight'] ?? null),
                $this->num($sku['package_length'] ?? null),
                $this->num($sku['package_width'] ?? null),
                $this->num($sku['package_height'] ?? null),
            );
            if ($package === null && array_filter($candidate) !== []) {
                $package = $candidate;
            }
        }

        $video = $this->arr($data['videos'] ?? null)[0] ?? null;

        // seen live: data.images [] while every SKU carries its own Images[]
        $images = array_filter($this->arr($data['images'] ?? null), 'is_string');
        if ($images === []) {
            foreach ($skus as $sku) {
                array_push($images, ...array_filter($this->arr($sku['Images'] ?? null), 'is_string'));
            }
        }

        return $this->result([
            'name' => $this->str($attrs['name'] ?? null),
            'description' => $description,
            'description_text' => $this->joinText(
                self::htmlToText($this->str($attrs['short_description'] ?? null)),
                self::htmlToText($this->str($attrs['description'] ?? null)),
            ),
            'brand_id' => $this->str($attrs['brand_id'] ?? null),
            'brand_name' => $this->str($attrs['brand'] ?? null),
            'category_id' => $categoryId,
            'category_name' => $this->localCategoryName(LazadaCategory::class, $categoryId),
            'images' => $images,
            'video_url' => $this->str(is_array($video) ? ($video['url'] ?? ($video['video_url'] ?? null)) : null),
            'attributes' => $attributes,
            'package' => $package,
            'variants' => $variants,
            'status' => $this->str($data['status'] ?? null),
            'listing_url' => $listingUrl,
            'raw' => $raw,
        ]);
    }

    /**
     * Display labels of Lazada attribute keys from our synced lazada_attributes
     * table (label_th, else label) — one query, free; unknown keys keep the key.
     *
     * @param  list<string>  $keys
     * @return array<string, string>
     */
    private function attributeLabels(array $keys): array
    {
        if ($keys === []) {
            return [];
        }

        try {
            return LazadaAttribute::query()->whereIn('name', $keys)->get(['name', 'label', 'label_th'])
                ->mapWithKeys(fn (LazadaAttribute $a) => [$a->name => $this->str($a->label_th) ?? $this->str($a->label) ?? $a->name])
                ->all();
        } catch (\Throwable) {
            return [];
        }
    }
}
