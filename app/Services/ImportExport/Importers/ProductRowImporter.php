<?php

namespace App\Services\ImportExport\Importers;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\ImportConfig;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\ProductCategoryLinker;
use App\Services\ImportExport\RowImportException;

class ProductRowImporter implements RowImporterInterface
{
    private const FIXED_COLUMNS = ['sku', 'family_code', 'type', 'enabled'];

    /**
     * Only non-locale/non-channel attributes are supported for v1 — imported
     * values always land as the global (channel_id=null, locale_id=null) value.
     */
    public function columns(): array
    {
        $attributeCodes = Attribute::where('is_locale_based', false)
            ->where('is_channel_based', false)
            ->orderBy('code')
            ->pluck('code')
            ->all();

        return array_merge(self::FIXED_COLUMNS, $attributeCodes);
    }

    public function requiredColumns(): array
    {
        return ['sku'];
    }

    public function importRow(array $row, ImportConfig $config): array
    {
        $sku = trim((string) ($row['sku'] ?? ''));
        if ($sku === '') {
            throw new RowImportException('sku is required');
        }

        if ($config->action === 'delete') {
            $product = Product::where('sku', $sku)->first();
            if (!$product) {
                throw new RowImportException("Product with sku '{$sku}' not found");
            }
            ProductValue::where('product_id', $product->id)->delete();
            $product->delete();
            return [];
        }

        $familyCode = trim((string) ($row['family_code'] ?? ''));
        $family = null;
        if ($familyCode !== '') {
            $family = AttributeFamily::where('code', $familyCode)->first();
            if (!$family) {
                throw new RowImportException("Unknown family_code '{$familyCode}'");
            }
        }

        $type = strtolower(trim((string) ($row['type'] ?? 'simple')));
        if (!in_array($type, ['simple', 'configurable'], true)) {
            throw new RowImportException("type must be 'simple' or 'configurable'");
        }

        $enabledRaw = strtolower(trim((string) ($row['enabled'] ?? '1')));
        $enabled = in_array($enabledRaw, ['1', 'true', 'yes'], true);

        $product = Product::updateOrCreate(
            ['sku' => $sku],
            [
                'family_id' => $family?->id,
                'type' => $type,
                'enabled' => $enabled,
            ]
        );

        $unknownColumns = [];

        foreach ($row as $key => $value) {
            if (in_array($key, self::FIXED_COLUMNS, true) || $value === null || $value === '') {
                continue;
            }

            $attribute = Attribute::where('code', $key)->first();
            if (!$attribute) {
                $unknownColumns[] = $key;
                continue;
            }

            ProductValue::updateOrCreate(
                ['product_id' => $product->id, 'attribute_id' => $attribute->id, 'channel_id' => null, 'locale_id' => null],
                ['value' => (string) $value]
            );
        }

        ProductCategoryLinker::linkFromCodes($product, [
            $row['pcatname'] ?? null,
            $row['psubcatname'] ?? null,
            $row['productgroupname'] ?? null,
        ]);

        if (empty($unknownColumns)) {
            return [];
        }

        return ["Column(s) ignored, no matching attribute found: ".implode(', ', $unknownColumns)];
    }
}
