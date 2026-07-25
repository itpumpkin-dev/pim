<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\Attribute;
use App\Models\ExportConfig;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\ImportExport\Importers\ProductRowImporter;

class ProductRowExporter implements RowExporterInterface, HasMediaFiles
{
    public function columns(): array
    {
        return (new ProductRowImporter())->columns();
    }

    public function rows(ExportConfig $config): \Generator
    {
        $attributeCodes = array_slice($this->columns(), 4);
        $attributesByCode = Attribute::whereIn('code', $attributeCodes)->get()->keyBy('code');

        foreach (Product::with('family')->orderBy('id')->cursor() as $product) {
            $values = ProductValue::where('product_id', $product->id)
                ->whereNull('channel_id')
                ->whereNull('locale_id')
                ->pluck('value', 'attribute_id');

            $row = [
                'sku' => $product->sku,
                'family_code' => $product->family?->code ?? '',
                'type' => $product->type,
                'enabled' => $product->enabled ? '1' : '0',
            ];

            foreach ($attributesByCode as $code => $attribute) {
                $row[$code] = $values->get($attribute->id, '');
            }

            yield $row;
        }
    }

    public function mediaPaths(ExportConfig $config): iterable
    {
        $mediaAttributeIds = Attribute::whereIn('type', ['image', 'file', 'gallery'])->pluck('id');
        if ($mediaAttributeIds->isEmpty()) {
            return;
        }

        foreach (ProductValue::whereIn('attribute_id', $mediaAttributeIds)->whereNotNull('value')->cursor() as $value) {
            if ($value->value === '') {
                continue;
            }

            $decoded = json_decode($value->value, true);
            if (is_array($decoded)) {
                foreach ($decoded as $path) {
                    if (is_string($path) && $path !== '') {
                        yield $path;
                    }
                }
                continue;
            }

            yield $value->value;
        }
    }
}
