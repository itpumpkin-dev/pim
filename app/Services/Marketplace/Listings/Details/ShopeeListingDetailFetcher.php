<?php

namespace App\Services\Marketplace\Listings\Details;

use App\Models\SalesPlatformShop;
use App\Models\ShopeeCategory;
use App\Services\Shopee\ShopeeClient;
use InvalidArgumentException;
use RuntimeException;

/**
 * Shopee: ShopeeClient::getItemBaseInfo([id]) (v2.product.get_item_base_info,
 * confirmed live 2026-11-09) + getModelList(id) (v2.product.get_model_list)
 * when the item has_model. Source units: weight kg (string), dimension
 * package_length/width/height cm (0 = not set → null).
 *
 * Description comes in one of two shapes: description_type "normal" →
 * `description` (plain text); "extended" →
 * description_info.extended_description.field_list[] of {field_type text,
 * text} / {field_type image, image_info} — the text fields are joined into
 * `description` (the images stay in `raw` only). Category name from our
 * synced shopee_categories table (name_th, else English name).
 * Variants: model[].tier_index[i] → tier_variation[i].name /
 * .option_list[idx].option; price = original_price, special_price =
 * current_price when lower (promotion).
 */
class ShopeeListingDetailFetcher extends AbstractListingDetailFetcher
{
    public const BASE_INFO = 'get_item_base_info';

    public const MODEL_LIST = 'get_model_list';

    public function fetch(SalesPlatformShop $shop, string $itemId): array
    {
        if (! ctype_digit($itemId)) {
            throw new InvalidArgumentException("Invalid Shopee item id '{$itemId}'.");
        }
        $account = $shop->shopeeAccount();
        if (! $account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked Shopee account.");
        }

        $client = new ShopeeClient($account);
        $base = $client->getItemBaseInfo([(int) $itemId]);
        $item = $base['response']['item_list'][0] ?? null;
        if (! is_array($item) || (string) ($item['item_id'] ?? '') !== $itemId) {
            throw new RuntimeException("Shopee item {$itemId} not found.");
        }
        // the batch warnings (shipping-fee estimates etc.) are noise for one item
        unset($base['warning']);

        $raw = [self::BASE_INFO => $base];
        if (! empty($item['has_model'])) {
            $raw[self::MODEL_LIST] = $client->getModelList((int) $itemId);
        }

        return $this->parse($raw, ['shopee_shop_id' => $account->shop_id]);
    }

    public function parse(array $raw, array $context = []): array
    {
        $item = $this->arr($raw[self::BASE_INFO]['response']['item_list'][0] ?? null);
        $itemId = $this->str($item['item_id'] ?? null);

        $description = $this->str($item['description'] ?? null);
        $fields = $this->arr($item['description_info']['extended_description']['field_list'] ?? null);
        if ($description === null && $fields !== []) {
            $texts = [];
            foreach ($fields as $field) {
                if (is_array($field) && ($field['field_type'] ?? null) === 'text' && ($t = $this->str($field['text'] ?? null)) !== null) {
                    $texts[] = $t;
                }
            }
            $description = $texts !== [] ? implode("\n", $texts) : null;
        }

        $brandId = $this->str($item['brand']['brand_id'] ?? null);
        $categoryId = $this->str($item['category_id'] ?? null);

        $attributes = [];
        foreach ($this->arr($item['attribute_list'] ?? null) as $attr) {
            if (! is_array($attr)) {
                continue;
            }
            $values = [];
            foreach ($this->arr($attr['attribute_value_list'] ?? null) as $value) {
                if (is_array($value) && ($v = $this->str($value['original_value_name'] ?? ($value['value_name'] ?? null))) !== null) {
                    $unit = $this->str($value['value_unit'] ?? null);
                    $values[] = $unit !== null ? "{$v} {$unit}" : $v;
                }
            }
            if ($a = $this->attribute($attr['attribute_id'] ?? null, $attr['original_attribute_name'] ?? ($attr['attribute_name'] ?? null), $values)) {
                $attributes[] = $a;
            }
        }

        $dimension = $this->arr($item['dimension'] ?? null);
        $shopeeShopId = $context['shopee_shop_id'] ?? null;

        return $this->result([
            'name' => $this->str($item['item_name'] ?? null),
            'description' => $description,
            'description_text' => self::htmlToText($description),
            'brand_id' => $brandId !== null && $brandId !== '0' ? $brandId : null,
            'brand_name' => $this->str($item['brand']['original_brand_name'] ?? null),
            'category_id' => $categoryId,
            'category_name' => $this->localCategoryName(ShopeeCategory::class, $categoryId, ['name_th', 'name']),
            'images' => array_filter($this->arr($item['image']['image_url_list'] ?? null), 'is_string'),
            'video_url' => $this->str($this->arr($item['video_info'] ?? null)[0]['video_url'] ?? null),
            'attributes' => $attributes,
            'package' => $this->package(
                $this->num($item['weight'] ?? null),
                $this->num($dimension['package_length'] ?? null),
                $this->num($dimension['package_width'] ?? null),
                $this->num($dimension['package_height'] ?? null),
            ),
            'variants' => isset($raw[self::MODEL_LIST]) ? $this->modelVariants($this->arr($raw[self::MODEL_LIST]['response'] ?? null)) : [
                $this->variant(
                    '',
                    $item['item_sku'] ?? null,
                    [],
                    $this->priceInfo($item)['original_price'] ?? null,
                    $this->priceInfo($item)['current_price'] ?? null,
                    $this->stock($item),
                    $item['item_status'] ?? null,
                    $this->arr($item['image']['image_url_list'] ?? null)[0] ?? null,
                ),
            ],
            'status' => $this->str($item['item_status'] ?? null),
            'listing_url' => $shopeeShopId && $itemId ? "https://shopee.co.th/product/{$shopeeShopId}/{$itemId}" : null,
            'raw' => $raw,
        ]);
    }

    private function modelVariants(array $response): array
    {
        $tiers = array_values($this->arr($response['tier_variation'] ?? null));
        // the API returns models in no particular order — show them in option order
        $models = array_values(array_filter($this->arr($response['model'] ?? null), 'is_array'));
        usort($models, fn ($a, $b) => $this->arr($a['tier_index'] ?? null) <=> $this->arr($b['tier_index'] ?? null));

        $variants = [];
        foreach ($models as $model) {
            if (! is_array($model) || empty($model['model_id'])) {
                continue;
            }
            $options = [];
            $image = null;
            foreach (array_values($this->arr($model['tier_index'] ?? null)) as $tierPos => $optionIndex) {
                $tier = $this->arr($tiers[$tierPos] ?? null);
                $option = is_int($optionIndex) ? $this->arr($this->arr($tier['option_list'] ?? null)[$optionIndex] ?? null) : [];
                $name = $this->str($tier['name'] ?? null) ?? 'ตัวเลือก '.($tierPos + 1);
                if (($value = $this->str($option['option'] ?? null)) !== null) {
                    $options[$name] = $value;
                }
                $image ??= $this->str($option['image']['image_url'] ?? null);
            }

            $variants[] = $this->variant(
                $model['model_id'],
                $model['model_sku'] ?? null,
                $options,
                $this->priceInfo($model)['original_price'] ?? null,
                $this->priceInfo($model)['current_price'] ?? null,
                $this->stock($model),
                $model['model_status'] ?? null,
                $image,
            );
        }

        return $variants;
    }

    private function priceInfo(array $entry): array
    {
        return $this->arr($this->arr($entry['price_info'] ?? null)[0] ?? null);
    }

    private function stock(array $entry): mixed
    {
        $summary = $this->arr($entry['stock_info_v2']['summary_info'] ?? null);
        if (isset($summary['total_available_stock'])) {
            return $summary['total_available_stock'];
        }
        $legacy = $this->arr($this->arr($entry['stock_info'] ?? null)[0] ?? null);

        return $legacy['current_stock'] ?? ($legacy['normal_stock'] ?? null);
    }
}
