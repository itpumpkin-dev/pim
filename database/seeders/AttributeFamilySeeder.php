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

        // pricing_packaging
        'barcode_pcs' => 'pricing_packaging', 'width_pcs' => 'pricing_packaging', 'length_pcs' => 'pricing_packaging',
        'height_pcs' => 'pricing_packaging', 'packaging_pcs' => 'pricing_packaging', 'weight_pcs' => 'pricing_packaging',
        'barcode_box' => 'pricing_packaging', 'width_box' => 'pricing_packaging', 'length_box' => 'pricing_packaging',
        'height_box' => 'pricing_packaging', 'packaging_box' => 'pricing_packaging', 'weight_box' => 'pricing_packaging',
        'barcode_ctn' => 'pricing_packaging', 'width_ctn' => 'pricing_packaging', 'length_ctn' => 'pricing_packaging',
        'height_ctn' => 'pricing_packaging', 'packaging_ctn' => 'pricing_packaging', 'weight_ctn' => 'pricing_packaging',
        'price_std' => 'pricing_packaging', 'price_recommend' => 'pricing_packaging', 'shelflife' => 'pricing_packaging',
        'cover_month' => 'pricing_packaging', 'leadtime' => 'pricing_packaging', 'moq' => 'pricing_packaging',
        'bom' => 'pricing_packaging', 'min_stock' => 'pricing_packaging', 'max_stock' => 'pricing_packaging',

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
