<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A read-only reporting view over the EAV product data (products +
 * product_values + categories), not a real table — always live (no refresh
 * job to keep in sync, no risk of drifting from the real data), and doesn't
 * require a migration every time a new attribute is added since it only
 * surfaces a curated set of report-worthy columns rather than mirroring the
 * full, ever-growing Attribute list.
 *
 * Every attribute-backed column reads the product's Default (channel_id IS
 * NULL) / untranslated (locale_id IS NULL) value — the same "global bucket"
 * ProductRowExporter and ProductPresenter's fallbacks already treat as each
 * product's base value.
 *
 * category_name/subcategory_name/product_group_name come from the real
 * `categories` tree (via product_category), not the legacy pcatname/
 * psubcatname/productgroupname attributes — see
 * ProductCategoryLinker::deriveLegacyCodesFromCategories() for why the tree,
 * not those attributes, is this app's source of truth for category data.
 * The product's most specific (deepest) assigned category is walked up to
 * derive all three columns, same "deepest wins" rule that method uses.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
            CREATE OR REPLACE VIEW master_products AS
            WITH deepest_category AS (
                SELECT DISTINCT ON (pc.product_id)
                    pc.product_id,
                    c.id,
                    c.name,
                    c.parent_id
                FROM product_category pc
                JOIN categories c ON c.id = pc.category_id
                ORDER BY pc.product_id, length(c.code) DESC, c.id ASC
            )
            SELECT
                p.id AS product_id,
                p.sku,
                p.parent_id,
                p.type,
                p.enabled,
                p.created_at,
                p.updated_at,
                af.code AS family_code,
                af.name AS family_name,
                pname_val.value AS product_name,
                brand_opt.admin_label AS brand,
                unit_opt.admin_label AS base_unit,
                ptype_opt.admin_label AS product_type,
                COALESCE(cat_l2.name, cat_l1.name, dc.name) AS category_name,
                CASE
                    WHEN cat_l2.id IS NOT NULL THEN cat_l1.name
                    WHEN cat_l1.id IS NOT NULL THEN dc.name
                    ELSE NULL
                END AS subcategory_name,
                CASE WHEN cat_l2.id IS NOT NULL THEN dc.name ELSE NULL END AS product_group_name,
                price_val.value AS price_std,
                price_rec_val.value AS price_recommend,
                qty_val.value AS qty,
                barcode_val.value AS barcode_pcs,
                weight_val.value AS weight_pcs,
                (eol_val.value = '1') AS eol
            FROM products p
            LEFT JOIN attribute_families af ON af.id = p.family_id
            LEFT JOIN deepest_category dc ON dc.product_id = p.id
            LEFT JOIN categories cat_l1 ON cat_l1.id = dc.parent_id
            LEFT JOIN categories cat_l2 ON cat_l2.id = cat_l1.parent_id
            LEFT JOIN product_values pname_val ON pname_val.product_id = p.id
                AND pname_val.attribute_id = (SELECT id FROM attributes WHERE code = 'pname')
                AND pname_val.channel_id IS NULL AND pname_val.locale_id IS NULL
            LEFT JOIN product_values brand_val ON brand_val.product_id = p.id
                AND brand_val.attribute_id = (SELECT id FROM attributes WHERE code = 'pbrand')
                AND brand_val.channel_id IS NULL AND brand_val.locale_id IS NULL
            LEFT JOIN attribute_options brand_opt ON brand_opt.attribute_id = brand_val.attribute_id AND brand_opt.code = brand_val.value
            LEFT JOIN product_values unit_val ON unit_val.product_id = p.id
                AND unit_val.attribute_id = (SELECT id FROM attributes WHERE code = 'pbaseunit')
                AND unit_val.channel_id IS NULL AND unit_val.locale_id IS NULL
            LEFT JOIN attribute_options unit_opt ON unit_opt.attribute_id = unit_val.attribute_id AND unit_opt.code = unit_val.value
            LEFT JOIN product_values ptype_val ON ptype_val.product_id = p.id
                AND ptype_val.attribute_id = (SELECT id FROM attributes WHERE code = 'producttype')
                AND ptype_val.channel_id IS NULL AND ptype_val.locale_id IS NULL
            LEFT JOIN attribute_options ptype_opt ON ptype_opt.attribute_id = ptype_val.attribute_id AND ptype_opt.code = ptype_val.value
            LEFT JOIN product_values price_val ON price_val.product_id = p.id
                AND price_val.attribute_id = (SELECT id FROM attributes WHERE code = 'price_std')
                AND price_val.channel_id IS NULL AND price_val.locale_id IS NULL
            LEFT JOIN product_values price_rec_val ON price_rec_val.product_id = p.id
                AND price_rec_val.attribute_id = (SELECT id FROM attributes WHERE code = 'price_recommend')
                AND price_rec_val.channel_id IS NULL AND price_rec_val.locale_id IS NULL
            LEFT JOIN product_values qty_val ON qty_val.product_id = p.id
                AND qty_val.attribute_id = (SELECT id FROM attributes WHERE code = 'qty')
                AND qty_val.channel_id IS NULL AND qty_val.locale_id IS NULL
            LEFT JOIN product_values barcode_val ON barcode_val.product_id = p.id
                AND barcode_val.attribute_id = (SELECT id FROM attributes WHERE code = 'barcode_pcs')
                AND barcode_val.channel_id IS NULL AND barcode_val.locale_id IS NULL
            LEFT JOIN product_values weight_val ON weight_val.product_id = p.id
                AND weight_val.attribute_id = (SELECT id FROM attributes WHERE code = 'weight_pcs')
                AND weight_val.channel_id IS NULL AND weight_val.locale_id IS NULL
            LEFT JOIN product_values eol_val ON eol_val.product_id = p.id
                AND eol_val.attribute_id = (SELECT id FROM attributes WHERE code = 'eol')
                AND eol_val.channel_id IS NULL AND eol_val.locale_id IS NULL
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP VIEW IF EXISTS master_products');
    }
};
