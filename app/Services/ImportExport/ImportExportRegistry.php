<?php

namespace App\Services\ImportExport;

use App\Models\Brand;
use App\Models\BrandTranslation;
use App\Models\BaseUnit;
use App\Models\BaseUnitTranslation;
use App\Models\BusinessType;
use App\Models\BusinessTypeTranslation;
use App\Models\CommissionGroup;
use App\Models\Currency;
use App\Models\CurrencyTranslation;
use App\Models\Point;
use App\Models\ProductGrade;
use App\Models\ProductGradeTranslation;
use App\Models\ProductType;
use App\Models\ProductTypeTranslation;
use App\Services\ImportExport\Exporters\AttributeFamilyRowExporter;
use App\Services\ImportExport\Exporters\AttributeOptionRowExporter;
use App\Services\ImportExport\Exporters\AttributeRowExporter;
use App\Services\ImportExport\Exporters\CategoryRowExporter;
use App\Services\ImportExport\Exporters\MasterEntityRowExporter;
use App\Services\ImportExport\Exporters\ProductRowExporter;
use App\Services\ImportExport\Exporters\RowExporterInterface;
use App\Services\ImportExport\Exporters\VendorRowExporter;
use App\Services\ImportExport\Importers\AttributeFamilyRowImporter;
use App\Services\ImportExport\Importers\AttributeOptionRowImporter;
use App\Services\ImportExport\Importers\AttributeRowImporter;
use App\Services\ImportExport\Importers\CategoryRowImporter;
use App\Services\ImportExport\Importers\MasterEntityRowImporter;
use App\Services\ImportExport\Importers\ProductRowImporter;
use App\Services\ImportExport\Importers\RowImporterInterface;
use App\Services\ImportExport\Importers\VendorRowImporter;
use App\Models\User;

class ImportExportRegistry
{
    /**
     * 'brands' .. 'product_types' are exactly MasterAttributeOptionSync::SOURCES'
     * keys (minus 'points'/'commission_groups', which mirror in too but have
     * no code column of their own — see masterEntityDefinitions()) — these
     * "simple master" entities all share one generic Importer/Exporter pair
     * (MasterEntityRowImporter/Exporter) driven by a MasterEntityDefinition,
     * rather than 9 near-identical hand-written classes.
     */
    public const TYPES = [
        'products', 'categories', 'attributes', 'attribute_families', 'attribute_options',
        'brands', 'base_units', 'points', 'commission_groups', 'business_types',
        'vendors', 'currencies', 'product_grades', 'product_types',
    ];

    /**
     * One MasterEntityDefinition per "simple master" type — see that class's
     * docblock. Kept as a method (not a const) since MasterEntityDefinition
     * isn't a const-expression-safe value in PHP.
     *
     * @return array<string, MasterEntityDefinition>
     */
    private static function masterEntityDefinitions(): array
    {
        return [
            'brands' => new MasterEntityDefinition(
                modelClass: Brand::class,
                fillable: ['slug', 'description', 'thumbnail', 'parent_id', 'sort_order', 'is_active'],
                translationModelClass: BrandTranslation::class,
                translationForeignKey: 'brand_id',
                fkLookups: ['parent_id' => ['model' => Brand::class, 'inputColumn' => 'parent_code']],
            ),
            'base_units' => new MasterEntityDefinition(
                modelClass: BaseUnit::class,
                fillable: ['slug', 'description', 'sort_order', 'is_active'],
                translationModelClass: BaseUnitTranslation::class,
                translationForeignKey: 'base_unit_id',
            ),
            // ไม่มีคอลัมน์ code เลย — point_type คือ key ตามธรรมชาติ (เป็นได้ทั้ง
            // ตัวอักษรไทยตัวเดียว เช่น "ก") และไม่มีตาราง translation ของตัวเอง
            // เลยไม่มี nameColumn แยก (point_type ทำหน้าที่นั้นในตัวอยู่แล้ว)
            'points' => new MasterEntityDefinition(
                modelClass: Point::class,
                keyColumn: 'point_type',
                fillable: ['point_ratio', 'start_date', 'end_date', 'is_active', 'remark'],
                nameColumn: null,
                dateColumns: ['start_date', 'end_date'],
            ),
            // code เป็น field ที่แอดมินพิมพ์เองได้ ไม่มี CodeGenerator, ไม่มี
            // ตาราง translation — p_group_name คือชื่อที่แสดง เขียนตรงๆ ไม่ผ่าน
            // ระบบ raw-column/translation แบบ Category
            'commission_groups' => new MasterEntityDefinition(
                modelClass: CommissionGroup::class,
                fillable: ['divisor_start', 'divisor_secondary', 'start_date', 'end_date', 'is_active', 'remark'],
                nameColumn: 'p_group_name',
                dateColumns: ['start_date', 'end_date'],
            ),
            'business_types' => new MasterEntityDefinition(
                modelClass: BusinessType::class,
                fillable: ['description', 'is_active'],
                translationModelClass: BusinessTypeTranslation::class,
                translationForeignKey: 'business_type_id',
            ),
            // vendors ไม่อยู่ที่นี่ — ใช้ VendorRowImporter/Exporter (คอลัมน์ ERP Vendor Master) ดู importer()
            // ไม่มีคอลัมน์ is_active เลย (ต่างจากอีก 8 ตัว)
            'currencies' => new MasterEntityDefinition(
                modelClass: Currency::class,
                fillable: ['exchange_rate'],
                translationModelClass: CurrencyTranslation::class,
                translationForeignKey: 'currency_id',
                booleanColumns: [],
            ),
            'product_grades' => new MasterEntityDefinition(
                modelClass: ProductGrade::class,
                fillable: ['description', 'start_date', 'end_date', 'is_active', 'sort_order'],
                translationModelClass: ProductGradeTranslation::class,
                translationForeignKey: 'product_grade_id',
                dateColumns: ['start_date', 'end_date'],
            ),
            'product_types' => new MasterEntityDefinition(
                modelClass: ProductType::class,
                fillable: ['description', 'is_active'],
                translationModelClass: ProductTypeTranslation::class,
                translationForeignKey: 'product_type_id',
            ),
        ];
    }

    /**
     * $user is only meaningful for 'products' — the other entity types
     * aren't gated by Attribute Access, so it's silently ignored for them.
     * $jobTrackerId is likewise only meaningful for 'products': it's how
     * ProductRowImporter reports AI-translate dispatch progress back onto
     * the import's own JobTracker row (see its total_translations_* columns).
     * $familyCode is products-only too: the import wizard's chosen Attribute
     * Family, which narrows columns()/requiredColumns() to that family and is
     * filed onto every row that doesn't carry its own `family_code`.
     */
    public static function importer(string $type, ?User $user = null, ?int $jobTrackerId = null, ?string $familyCode = null): RowImporterInterface
    {
        // เวนเดอร์ใช้คอลัมน์ของ ERP Vendor Master ตรงๆ (VendId …) แทน definition generic ด้านล่าง
        if ($type === 'vendors') {
            return new VendorRowImporter();
        }

        $masterDefinitions = self::masterEntityDefinitions();
        if (isset($masterDefinitions[$type])) {
            return new MasterEntityRowImporter($masterDefinitions[$type]);
        }

        return match ($type) {
            'products' => new ProductRowImporter($user, $jobTrackerId, $familyCode),
            'categories' => new CategoryRowImporter(),
            'attributes' => new AttributeRowImporter(),
            'attribute_families' => new AttributeFamilyRowImporter(),
            'attribute_options' => new AttributeOptionRowImporter(),
            default => throw new \InvalidArgumentException("Unknown import/export type: {$type}"),
        };
    }

    /**
     * $user is only meaningful for 'products' — see importer().
     */
    public static function exporter(string $type, ?User $user = null): RowExporterInterface
    {
        if ($type === 'vendors') {
            return new VendorRowExporter();
        }

        $masterDefinitions = self::masterEntityDefinitions();
        if (isset($masterDefinitions[$type])) {
            return new MasterEntityRowExporter($masterDefinitions[$type]);
        }

        return match ($type) {
            'products' => new ProductRowExporter($user),
            'categories' => new CategoryRowExporter(),
            'attributes' => new AttributeRowExporter(),
            'attribute_families' => new AttributeFamilyRowExporter(),
            'attribute_options' => new AttributeOptionRowExporter(),
            default => throw new \InvalidArgumentException("Unknown import/export type: {$type}"),
        };
    }
}
