<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\Attribute;
use App\Models\ExportConfig;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\User;
use App\Services\Catalog\AttributeAccessPolicy;
use App\Services\ImportExport\Importers\ProductRowImporter;

class ProductRowExporter implements RowExporterInterface, HasMediaFiles
{
    private ?array $columnsCache = null;

    /**
     * $user, when given, restricts columns()/rows() to attributes this
     * user's role can *view* (per AttributeAccessPolicy — both the
     * attribute itself and its Attribute Group, in every family it belongs
     * to) — null (the default) keeps every existing caller that doesn't
     * pass one unfiltered, matching the prior behavior.
     */
    public function __construct(private readonly ?User $user = null)
    {
    }

    public function columns(): array
    {
        return $this->columnsCache ??= array_merge(
            ProductRowImporter::FIXED_COLUMNS,
            app(AttributeAccessPolicy::class)->filterAttributeCodes($this->user, ProductRowImporter::baseAttributeCodes(), 'view'),
        );
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
