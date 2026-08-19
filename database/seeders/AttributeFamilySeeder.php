<?php

namespace Database\Seeders;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AttributeFamilySeeder extends Seeder
{
    /** attribute code => attribute group code, covering every code in AttributeCatalogSeeder */
    private const GROUP_BY_ATTRIBUTE = [
        // general
        // pcatid/pcatname/psubcatname/productgroupname are deliberately NOT
        // assigned to a group here: the real `categories` tree (product_category
        // pivot, picked via the Edit Product page's tree picker) is now the
        // single place an admin chooses a product's category — those four
        // legacy attributes are derived from that selection automatically
        // (see ProductCategoryLinker::deriveLegacyCodesFromCategories(),
        // called from ProductController::update()) purely to keep older
        // consumers (WooCommerce export, ProductPresenter's fallback, Lazada
        // mapping) fed, and are intentionally hidden from manual editing.
        'pid' => 'general', 'pname' => 'general', 'pbaseunit' => 'general', 'pbrand' => 'general',
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

        // Added to match fields present on the legacy "สร้างรายการสินค้า"
        // product-create form that had no equivalent attribute yet.
        'sale_pack_size' => 'general', 'is_main_sale_unit' => 'general', 'is_main_purchase_unit' => 'general',
        'commission_group' => 'general', 'size' => 'specifications', 'model' => 'specifications',
        'replace_old_product' => 'general', 'replace_out_of_stock' => 'general',
        'is_bom' => 'general', 'bom_data' => 'general', 'rmp_id' => 'general',

        'end_bill_discount' => 'pricing_packaging', 'price_type' => 'pricing_packaging',
        'pcs_per_ctn' => 'packaging',

        'vendor' => 'purchasing', 'sub_vendor' => 'purchasing', 'purchase_currency' => 'purchasing',
        'hs_code' => 'purchasing', 'import_duty' => 'purchasing', 'ordinary_certificate_of_origin' => 'purchasing',
        'final_duty' => 'purchasing', 'statistics_code' => 'purchasing',

        'rop' => 'accounting', 'discount_std' => 'accounting', 'cost_std' => 'accounting', 'gp_std' => 'accounting',

        // WooCommerce import support (see WooCommerceConverter) — grouped
        // alongside pimage (media, general) and model/size (specifications).
        'youtube_url' => 'general', 'catalog_pdf' => 'general', 'power_type' => 'specifications',
    ];

    public function run(): void
    {
        $family = AttributeFamily::updateOrCreate(
            ['code' => 'general_chemical_product'],
            ['name' => 'สินค้าเคมีภัณฑ์ทั่วไป']
        );

        // pcatid/pcatname/psubcatname/productgroupname used to be assigned here
        // (to 'general') before the categories-tree derivation replaced manual
        // editing — retract any pre-existing row for them so a database seeded
        // before that change ends up in the same state as a fresh one, instead
        // of silently keeping the four fields editable forever because
        // upserting below only ever adds/updates codes still in the map, never
        // removes ones that dropped out of it.
        $retiredAttributeIds = Attribute::whereIn('code', ['pcatid', 'pcatname', 'psubcatname', 'productgroupname'])->pluck('id');
        DB::table('family_attributes')->where('family_id', $family->id)->whereIn('attribute_id', $retiredAttributeIds)->delete();

        $attributeIds = Attribute::whereIn('code', array_keys(self::GROUP_BY_ATTRIBUTE))->pluck('id', 'code');
        $groupIds = AttributeGroup::pluck('id', 'code');

        foreach (self::GROUP_BY_ATTRIBUTE as $attributeCode => $groupCode) {
            $attributeId = $attributeIds->get($attributeCode);
            $groupId = $groupIds->get($groupCode);

            if (!$attributeId || !$groupId) {
                continue;
            }

            // Plain query builder, not the FamilyAttribute Eloquent Pivot: outside
            // a real BelongsToMany relation its foreign/related keys are never
            // set, so Pivot::setKeysForSaveQuery() builds an update WHERE clause
            // on empty column names and fails on every row that already exists.
            DB::table('family_attributes')->updateOrInsert(
                ['family_id' => $family->id, 'attribute_id' => $attributeId],
                ['attribute_group_id' => $groupId]
            );
        }
    }
}
