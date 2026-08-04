<?php

namespace App\Services\Lazada;

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\LazadaProductMapping;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\SalesPlatformShop;
use App\Services\Catalog\AttributeValueFormatter;
use RuntimeException;

/**
 * Orchestrates pushing one product to one shop: gathers our own data and
 * validates it against Lazada's live category schema (buildPayload — reads
 * only, safe to call any time) and, only when explicitly asked, sends it to
 * Lazada via LazadaClient (push — a real, live write).
 */
class LazadaProductSyncService
{
    /**
     * Our attribute code for each Lazada SKU-level field this category
     * might require — anything mandatory but not in this map (e.g. a
     * category-specific option like "Input Voltage") can't be auto-filled
     * and will surface as a validation error instead.
     */
    private const SKU_FIELD_SOURCE = [
        'package_weight' => 'weight_pcs',
        'package_length' => 'length_pcs',
        'package_width' => 'width_pcs',
        'package_height' => 'height_pcs',
    ];

    public function __construct(private readonly LazadaClient $client)
    {
    }

    public static function forShop(SalesPlatformShop $shop): self
    {
        $account = $shop->lazadaAccount();
        if (!$account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked Lazada account.");
        }

        return new self(new LazadaClient($account));
    }

    /**
     * Gathers our own data into Lazada's payload shape, then validates it
     * against that category's live mandatory-field list (one read-only API
     * call — safe, no write). Throws with a specific, actionable list of
     * what's missing rather than letting an incomplete payload reach push().
     */
    public function buildPayload(Product $product, SalesPlatformShop $shop): array
    {
        $category = $product->categories()->whereNotNull('lazada_category_id')->first();
        if (!$category) {
            throw new RuntimeException("Product '{$product->sku}' has no category mapped to a Lazada category yet.");
        }

        $name = $this->attributeValue($product, 'pname', $shop->channel_id, localeCode: 'th');
        $price = $this->attributeValue($product, 'price_std', $shop->channel_id);
        $imageUrl = $this->attributeValue($product, 'pimage', $shop->channel_id);
        $qty = $this->attributeValue($product, 'qty', $shop->channel_id);
        $brand = $this->attributeValue($product, 'pbrand', $shop->channel_id);

        if (!$name || !$price) {
            throw new RuntimeException("Product '{$product->sku}' is missing a name or price — cannot push to Lazada.");
        }

        $skuFields = [
            'SellerSku' => $product->sku,
            'quantity' => (int) ($qty ?? 0),
            'price' => $price,
            'images' => $imageUrl ? [$imageUrl] : null,
        ];
        foreach (self::SKU_FIELD_SOURCE as $lazadaField => $ourAttributeCode) {
            $skuFields[$lazadaField] = $this->attributeValue($product, $ourAttributeCode, $shop->channel_id);
        }

        $payload = [
            'primary_category_id' => $category->lazada_category_id,
            'attributes' => array_filter([
                'name' => $name,
                'short_description' => $name,
                'brand' => $brand,
            ]),
            'skus' => [
                array_filter($skuFields, fn ($v) => $v !== null && $v !== ''),
            ],
        ];

        $this->assertMandatoryFieldsPresent($category->lazada_category_id, $payload);

        return $payload;
    }

    /**
     * Decides create vs. update from n8n's lazada_product_mapping (does this
     * SKU already have a live item_id under this shop?), then pushes.
     *
     * FIRES A REAL, LIVE WRITE TO LAZADA — creates or edits an actual
     * listing on the seller's storefront, visible to real customers. Only
     * call this with the user's explicit, specific go-ahead; buildPayload()
     * above is the safe way to inspect what would be sent first.
     */
    public function push(Product $product, SalesPlatformShop $shop): array
    {
        $payload = $this->buildPayload($product, $shop);

        $existing = LazadaProductMapping::where('seller_sku', $product->sku)
            ->where('shop_name', $shop->name)
            ->first();

        return $existing
            ? $this->client->updateProduct($payload)
            : $this->client->createProduct($payload);
    }

    /**
     * Read-only — fetches the category's live attribute schema and checks
     * every field it marks is_mandatory=1 has a non-empty value in $payload.
     */
    private function assertMandatoryFieldsPresent(int $categoryId, array $payload): void
    {
        $schema = $this->client->getCategoryAttributes($categoryId);
        $skuFields = $payload['skus'][0] ?? [];
        $missing = [];

        foreach ($schema['data'] ?? [] as $field) {
            if (empty($field['is_mandatory'])) {
                continue;
            }

            $providedIn = $field['attribute_type'] === 'sku' ? $skuFields : $payload['attributes'];
            $value = $providedIn[$field['name']] ?? null;

            if ($value === null || $value === '' || $value === []) {
                $missing[] = ($field['label'] ?? $field['name']).' ('.$field['name'].')';
            }
        }

        if (!empty($missing)) {
            throw new RuntimeException(
                'Missing mandatory Lazada field(s) for this category: '.implode(', ', $missing)
            );
        }
    }

    private function attributeValue(Product $product, string $attributeCode, ?int $channelId, ?string $localeCode = null): ?string
    {
        $attribute = Attribute::where('code', $attributeCode)->first();
        if (!$attribute) {
            return null;
        }

        $query = ProductValue::where('product_id', $product->id)
            ->where('attribute_id', $attribute->id)
            ->where('channel_id', $attribute->is_channel_based ? $channelId : null);

        if ($attribute->is_locale_based) {
            $localeId = $localeCode ? Locale::where('code', $localeCode)->value('id') : null;
            $query->where('locale_id', $localeId);
        } else {
            $query->whereNull('locale_id');
        }

        $raw = $query->value('value');

        $formatted = AttributeValueFormatter::format($attribute, $raw);

        return is_array($formatted) ? ($formatted[0] ?? null) : $formatted;
    }
}
