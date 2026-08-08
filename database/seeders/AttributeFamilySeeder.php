<?php

namespace Database\Seeders;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use Illuminate\Database\Seeder;

class AttributeFamilySeeder extends Seeder
{
    /** attribute code => attribute group code, covering every code in AttributeCatalogSeeder */
    private const GROUP_BY_ATTRIBUTE = [
        // general
        'pid' => 'general', 'pname' => 'general', 'pbaseunit' => 'general', 'pbrand' => 'general',
        'pcatid' => 'general', 'pcatname' => 'general', 'psubcatname' => 'general', 'productgroupname' => 'general',
        'producttype' => 'general', 'eol' => 'general', 'pgroupname' => 'general', 'pimage' => 'general',
        'unitinfo' => 'general', 'pointtype' => 'general', 'search' => 'general', 'sales_channel' => 'general',

        // pricing_packaging (now "Pricing" — money only) and packaging
        // (physical/logistics — dimensions, weight, barcodes, shelf life,
        // lead time, stock levels, ...), split from the original combined group.
        'price_std' => 'pricing_packaging', 'price_recommend' => 'pricing_packaging',

        'barcode_pcs' => 'packaging', 'width_pcs' => 'packaging', 'length_pcs' => 'packaging',
        'height_pcs' => 'packaging', 'packaging_pcs' => 'packaging', 'weight_pcs' => 'packaging',
        'barcode_box' => 'packaging', 'width_box' => 'packaging', 'length_box' => 'packaging',
        'height_box' => 'packaging', 'packaging_box' => 'packaging', 'weight_box' => 'packaging',
        'barcode_ctn' => 'packaging', 'width_ctn' => 'packaging', 'length_ctn' => 'packaging',
        'height_ctn' => 'packaging', 'packaging_ctn' => 'packaging', 'weight_ctn' => 'packaging',
        'shelflife' => 'packaging', 'cover_month' => 'packaging', 'leadtime' => 'packaging', 'moq' => 'packaging',
        'bom' => 'packaging', 'min_stock' => 'packaging', 'max_stock' => 'packaging', 'qty' => 'packaging',

        // specifications
        'spec_specifications' => 'specifications', 'spec_features' => 'specifications', 'spec_accessories' => 'specifications',
        'spec_packaging' => 'specifications', 'grade' => 'specifications', 'product_details_features' => 'specifications',
        'accessories_freebies' => 'specifications', 'included_accessories' => 'specifications', 'optional_accessories' => 'specifications',
        'first_import_date' => 'specifications',

        // warranty_usage
        'warranty_period' => 'warranty_usage', 'warranty_conditions' => 'warranty_usage', 'warranty_notes' => 'warranty_usage',
        'how_to_use' => 'warranty_usage', 'warnings' => 'warranty_usage', 'precautions' => 'warranty_usage',
        'storage_instructions' => 'warranty_usage', 'recommendations' => 'warranty_usage', 'notes' => 'warranty_usage',
    ];

    public function run(): void
    {
        $family = AttributeFamily::updateOrCreate(
            ['code' => 'general_chemical_product'],
            ['name' => 'สินค้าเคมีภัณฑ์ทั่วไป']
        );

        $attributeIds = Attribute::whereIn('code', array_keys(self::GROUP_BY_ATTRIBUTE))->pluck('id', 'code');
        $groupIds = AttributeGroup::pluck('id', 'code');

        foreach (self::GROUP_BY_ATTRIBUTE as $attributeCode => $groupCode) {
            $attributeId = $attributeIds->get($attributeCode);
            $groupId = $groupIds->get($groupCode);

            if (!$attributeId || !$groupId) {
                continue;
            }

            FamilyAttribute::updateOrCreate(
                ['family_id' => $family->id, 'attribute_id' => $attributeId],
                ['attribute_group_id' => $groupId]
            );
        }
    }
}
