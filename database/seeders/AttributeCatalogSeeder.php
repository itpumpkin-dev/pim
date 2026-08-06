<?php

namespace Database\Seeders;

use App\Models\Attribute;
use Illuminate\Database\Seeder;

class AttributeCatalogSeeder extends Seeder
{
    /**
     * The full attribute set the storefront (ProductPresenter) and admin
     * catalog grid already expect. Declared idempotently here so the whole
     * seeding pipeline is reproducible from a blank database, instead of
     * silently depending on these already existing by chance.
     *
     * code => [type, is_locale_based, is_required, is_channel_based?]
     * (4th element defaults to false when omitted)
     */
    private const ATTRIBUTES = [
        'pid' => ['text', false, true],
        'pname' => ['text', true, true],
        'pbaseunit' => ['select', false, false],
        'pbrand' => ['select', false, false],
        'pcatid' => ['select', false, false],
        'pcatname' => ['select', false, false],
        'psubcatname' => ['select', false, false],
        'productgroupname' => ['select', false, false],
        'producttype' => ['select', false, false],
        'eol' => ['boolean', false, false],
        'pgroupname' => ['select', false, false],
        'pimage' => ['image', false, false],
        'unitinfo' => ['text', false, false],
        'pointtype' => ['select', false, false],
        'barcode_pcs' => ['text', false, false],
        'width_pcs' => ['price', false, false],
        'length_pcs' => ['price', false, false],
        'height_pcs' => ['price', false, false],
        'packaging_pcs' => ['price', false, false],
        'weight_pcs' => ['price', false, false],
        'barcode_box' => ['text', false, false],
        'width_box' => ['price', false, false],
        'length_box' => ['price', false, false],
        'height_box' => ['price', false, false],
        'packaging_box' => ['price', false, false],
        'weight_box' => ['price', false, false],
        'barcode_ctn' => ['text', false, false],
        'width_ctn' => ['price', false, false],
        'length_ctn' => ['price', false, false],
        'height_ctn' => ['price', false, false],
        'packaging_ctn' => ['price', false, false],
        'weight_ctn' => ['price', false, false],
        'warranty_period' => ['price', false, false],
        'warranty_conditions' => ['textarea', true, false],
        'warranty_notes' => ['textarea', true, false],
        // Channel-based so each sales platform shop (see SalesPlatformShop's
        // linked Channel) can carry its own price, separate from the base/
        // web price — see the "sales platforms vs channels" design work.
        'price_std' => ['price', false, false, true],
        'price_recommend' => ['price', false, false],
        'search' => ['text', false, false],
        'product_details_features' => ['textarea', true, false],
        'accessories_freebies' => ['textarea', true, false],
        'included_accessories' => ['textarea', true, false],
        'optional_accessories' => ['textarea', true, false],
        'how_to_use' => ['textarea', true, false],
        'warnings' => ['textarea', true, false],
        'precautions' => ['textarea', true, false],
        'storage_instructions' => ['textarea', true, false],
        'recommendations' => ['textarea', true, false],
        'notes' => ['textarea', true, false],
        'spec_specifications' => ['textarea', true, false],
        'spec_features' => ['textarea', true, false],
        'spec_accessories' => ['textarea', true, false],
        'spec_packaging' => ['textarea', true, false],
        'shelflife' => ['price', false, false],
        'grade' => ['select', false, false],
        'cover_month' => ['price', false, false],
        'leadtime' => ['price', false, false],
        'first_import_date' => ['date', false, false],
        'sales_channel' => ['multiselect', false, false],
        'moq' => ['price', false, false],
        'bom' => ['textarea', false, false],
        'min_stock' => ['price', false, false],
        'max_stock' => ['price', false, false],
        'qty' => ['price', false, false],
        'current_stock' => ['price', false, false],
    ];

    public function run(): void
    {
        foreach (self::ATTRIBUTES as $code => $config) {
            [$type, $isLocaleBased, $isRequired] = $config;
            $isChannelBased = $config[3] ?? false;

            Attribute::updateOrCreate(
                ['code' => $code],
                [
                    'name' => ucfirst(str_replace('_', ' ', $code)),
                    'type' => $type,
                    'is_locale_based' => $isLocaleBased,
                    'is_channel_based' => $isChannelBased,
                    'is_required' => $isRequired,
                    'swatch_type' => in_array($type, ['select', 'multiselect'], true) ? 'text' : null,
                ]
            );
        }
    }
}
