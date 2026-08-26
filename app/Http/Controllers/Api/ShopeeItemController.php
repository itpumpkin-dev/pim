<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Product;
use App\Models\ShopeeAttributeMapping;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Read-only stand-in for Shopee Open Platform's v2.product.get_item_base_info
 * (see storage/app/pdfgetitemexams/Documentation - Shopee Open Platform
 * GetItem.pdf) — reshapes our own PIM product data into that same response
 * envelope/field names, so any system already built to consume Shopee's
 * GetItem shape can point at this endpoint instead of the real Shopee API.
 *
 * `item_id` here is our own products.id, not a real Shopee item_id — most
 * products queried through this endpoint were never pushed to Shopee at all.
 * For a product that *was* pushed live, its real Shopee item_id is cached on
 * product_platform_shops.platform_item_id (see ShopeeProductSyncService),
 * which this endpoint intentionally does not surface — mixing "our id" and
 * "their id" in the same field would be worse than being consistently ours.
 *
 * Field coverage is deliberately partial: only what the admin-configurable
 * ShopeeAttributeMapping data can resolve (name/price/qty/weight/dimension/
 * description/images) plus category (via Category.shopee_category_id),
 * brand (the generic `pbrand` attribute), and a few structural fields
 * (has_model from parent/variant rows, item_status from `enabled`).
 * attribute_list/logistic_info/video_info/wholesales/tax_info/
 * complaint_policy/certification_info all require either a live call to
 * Shopee's own category schema or data this PIM doesn't track — they're
 * left out rather than faked, same "don't guess" rule
 * ShopeeProductSyncService::resolveAttributes() already follows.
 */
class ShopeeItemController extends Controller
{
    use ResolvesProductAttributeValues;

    private const MAX_ITEM_IDS = 50;

    public function getItemBaseInfo(Request $request): JsonResponse
    {
        $requestId = bin2hex(random_bytes(16));

        $rawIds = array_filter(array_map('trim', explode(',', (string) $request->query('item_id_list', ''))));
        $itemIds = array_values(array_unique(array_map(
            'intval',
            array_filter($rawIds, fn ($id) => ctype_digit($id))
        )));

        if (empty($itemIds)) {
            return response()->json(
                $this->errorEnvelope($requestId, 'error_param', 'item_id_list is required — a comma-separated list of item_id, limit [1,'.self::MAX_ITEM_IDS.']'),
                422
            );
        }

        if (count($itemIds) > self::MAX_ITEM_IDS) {
            return response()->json(
                $this->errorEnvelope($requestId, 'error_param', 'item_id_list exceeds the limit of '.self::MAX_ITEM_IDS),
                422
            );
        }

        $channelId = $request->query('channel_id') !== null ? (int) $request->query('channel_id') : null;

        $products = Product::with(['categories', 'variants'])
            ->whereIn('id', $itemIds)
            ->where('enabled', true)
            ->get()
            ->keyBy('id');

        $mappings = ShopeeAttributeMapping::with('attribute')->orderBy('sort_order')->get();

        $itemList = [];
        foreach ($itemIds as $id) {
            if ($product = $products->get($id)) {
                $itemList[] = $this->presentItem($product, $mappings, $channelId);
            }
        }

        $missingIds = array_values(array_diff($itemIds, array_column($itemList, 'item_id')));

        return response()->json([
            'error' => '',
            'message' => '',
            'warning' => $missingIds ? ('item_id not found: '.implode(',', $missingIds)) : '',
            'request_id' => $requestId,
            'response' => [
                'item_list' => $itemList,
            ],
        ]);
    }

    private function presentItem(Product $product, Collection $mappings, ?int $channelId): array
    {
        $category = $product->categories->first(fn ($c) => $c->shopee_category_id !== null);

        $name = $this->resolveMappedField($mappings, 'name', $product, $channelId, localeCode: 'th') ?: $product->sku;
        $description = $this->resolveMappedField($mappings, 'description', $product, $channelId, localeCode: 'th') ?: $name;

        $weight = $this->resolveMappedField($mappings, 'weight', $product, $channelId);
        $length = $this->resolveMappedField($mappings, 'length', $product, $channelId);
        $width = $this->resolveMappedField($mappings, 'width', $product, $channelId);
        $height = $this->resolveMappedField($mappings, 'height', $product, $channelId);

        $imageUrls = $this->resolveProductImageUrls($product, $channelId);

        $hasModel = $product->type === 'configurable' && $product->variants->isNotEmpty();

        $item = [
            'item_id' => $product->id,
            'category_id' => $category ? (int) $category->shopee_category_id : null,
            'item_name' => $name,
            'description' => $description,
            'item_sku' => $product->sku,
            'create_time' => $product->created_at?->timestamp,
            'update_time' => $product->updated_at?->timestamp,
            'image' => [
                'image_url_list' => $imageUrls,
                'image_id_list' => [],
                'image_ratio' => null,
            ],
            'weight' => $weight,
            'dimension' => [
                'package_length' => $length !== null ? (int) $length : null,
                'package_width' => $width !== null ? (int) $width : null,
                'package_height' => $height !== null ? (int) $height : null,
            ],
            'condition' => 'NEW',
            'item_status' => $product->enabled ? 'NORMAL' : 'UNLIST',
            'has_model' => $hasModel,
            'has_promotion' => false,
            'brand' => [
                'brand_id' => 0,
                'original_brand_name' => $this->resolveBrandName($product, $channelId) ?? '',
            ],
        ];

        // Mirrors Shopee's own rule: an item with models carries its price
        // and stock on each model (get_model_list), not on the item itself.
        if (!$hasModel) {
            $price = $this->resolveMappedField($mappings, 'price', $product, $channelId);
            $qty = $this->resolveMappedField($mappings, 'qty', $product, $channelId);

            $item['price_info'] = [[
                'currency' => 'THB',
                'original_price' => $price !== null ? (float) $price : 0.0,
                'current_price' => $price !== null ? (float) $price : 0.0,
            ]];

            $item['stock_info_v2'] = [
                'summary_info' => [
                    'total_reserved_stock' => 0,
                    'total_available_stock' => $qty !== null ? (int) $qty : 0,
                ],
                'seller_stock' => [[
                    'location_id' => '',
                    'stock' => $qty !== null ? (int) $qty : 0,
                    'if_saleable' => true,
                ]],
                'shopee_stock' => [],
            ];
        }

        return $item;
    }

    /**
     * `pbrand` is a select-type attribute (see ProductPresenter's
     * SELECT_CODES_TO_RESOLVE docblock) whose stored value is an
     * AttributeOption `code`, not its display label — resolve it back the
     * same way ProductPresenter does, so this returns "Pumpkin" instead of
     * a bare code like "option_1". Falls back to the raw value for legacy
     * free-typed rows that predate the field becoming a dropdown.
     */
    private function resolveBrandName(Product $product, ?int $channelId): ?string
    {
        $raw = $this->attributeValue($product, 'pbrand', $channelId, localeCode: 'th');
        if (!$raw) {
            return null;
        }

        $attribute = Attribute::where('code', 'pbrand')->first();
        if (!$attribute) {
            return $raw;
        }

        $label = AttributeOption::where('attribute_id', $attribute->id)
            ->where('code', $raw)
            ->value('admin_label');

        return $label ?: $raw;
    }

    private function errorEnvelope(string $requestId, string $error, string $message): array
    {
        return [
            'error' => $error,
            'message' => $message,
            'warning' => '',
            'request_id' => $requestId,
            'response' => null,
        ];
    }
}
