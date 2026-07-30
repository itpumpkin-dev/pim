<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\Product;
use App\Models\ProductValue;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

/**
 * Maps EAV-backed Product/ProductValue rows to the plain shape the public
 * storefront pages (home, products/show) expect, matching the `Product`
 * interface in resources/js/data/products.ts.
 */
class ProductPresenter
{
    private const CODES = [
        'pname', 'pbrand', 'pcatname', 'pimage',
        'price_std', 'price_recommend',
        'pbaseunit', 'packaging_box', 'unitinfo', 'eol',
        'product_details_features', 'spec_specifications', 'spec_features',
        'spec_accessories', 'spec_packaging', 'warranty_period',
        'how_to_use', 'warnings',
    ];

    public static function mapMany(Collection $products): array
    {
        if ($products->isEmpty()) {
            return [];
        }

        $attributesByCode = Attribute::whereIn('code', self::CODES)->get(['id', 'code'])->keyBy('id');

        $values = ProductValue::whereIn('product_id', $products->pluck('id'))
            ->whereIn('attribute_id', $attributesByCode->keys())
            ->get(['product_id', 'attribute_id', 'value']);

        $valuesByProduct = $values->groupBy('product_id')->map(
            fn (Collection $rows) => $rows->mapWithKeys(
                fn (ProductValue $row) => [$attributesByCode[$row->attribute_id]->code => $row->value]
            )
        );

        return $products->map(
            fn (Product $product) => self::mapOne($product, $valuesByProduct->get($product->id, collect()))
        )->values()->all();
    }

    private static function mapOne(Product $product, Collection $values): array
    {
        $get = fn (string $code) => $values->get($code) ?: null;

        $price = (float) ($get('price_std') ?? $get('price_recommend') ?? 0);

        $specs = array_filter([
            'ข้อมูลจำเพาะ' => self::plainText($get('spec_specifications')),
            'บรรจุภัณฑ์' => self::plainText($get('spec_packaging')),
            'อุปกรณ์เสริม' => self::plainText($get('spec_accessories')),
            'วิธีใช้งาน' => self::plainText($get('how_to_use')),
            'คำเตือน' => self::plainText($get('warnings')),
            'การรับประกัน' => $get('warranty_period') ? $get('warranty_period').' เดือน' : null,
        ]);

        $result = [
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => $get('pname') ?? $product->sku,
            'brand' => $get('pbrand') ?? '-',
            'category' => $get('pcatname') ?? 'ทั่วไป',
            'size' => $get('unitinfo') ?? '',
            'packUnit' => $get('pbaseunit') ?? 'ชิ้น',
            'packQty' => (int) ($get('packaging_box') ?? 1),
            'price' => $price,
            'description' => self::plainText($get('product_details_features')) ?? '-',
            'highlights' => self::toLines($get('spec_features')),
            'specs' => $specs,
        ];

        if ($imagePath = $get('pimage')) {
            $result['image'] = Storage::url($imagePath);
        }

        if ($get('eol') === '1') {
            $result['tag'] = 'เลิกผลิต';
            $result['tagColor'] = 'error';
        }

        return $result;
    }

    private static function plainText(?string $html): ?string
    {
        if (!$html) {
            return null;
        }

        $text = trim(strip_tags($html));

        return $text !== '' ? $text : null;
    }

    private static function toLines(?string $html): array
    {
        if (!$html) {
            return [];
        }

        $text = str_replace(['<li>', '<br>', '<br/>', '<br />'], "\n", $html);
        $text = strip_tags($text);

        return collect(explode("\n", $text))
            ->map(fn ($line) => trim($line))
            ->filter()
            ->values()
            ->all();
    }
}
