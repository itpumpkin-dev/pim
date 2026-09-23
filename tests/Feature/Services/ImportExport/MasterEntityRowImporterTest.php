<?php

use App\Models\Brand;
use App\Models\CommissionGroup;
use App\Models\Currency;
use App\Models\ImportConfig;
use App\Models\Locale;
use App\Models\Point;
use App\Models\ProductGrade;
use App\Models\Vendor;
use App\Services\ImportExport\ImportExportRegistry;
use App\Services\ImportExport\RowImportException;

/**
 * MasterEntityRowImporter/Exporter (app/Services/ImportExport/Importers/
 * MasterEntityRowImporter.php, .../Exporters/MasterEntityRowExporter.php)
 * generically drive all 9 "simple master" import types added to
 * ImportExportRegistry::TYPES this session (brands, base_units, points,
 * commission_groups, business_types, vendors, currencies, product_grades,
 * product_types) — one Importer/Exporter pair instead of 9 hand-written
 * classes, modeled on CategoryRowImporter.
 */
function metImportConfig(string $type, array $overrides = []): ImportConfig
{
    return ImportConfig::create(array_merge([
        'code' => 'met_config_'.uniqid(),
        'type' => $type,
        'file_format' => 'csv',
        'field_separator' => ',',
        'action' => 'create_update',
        'validation_strategy' => 'skip_errors',
        'ai_translate' => false,
        'source_locale' => 'th',
        'allowed_errors' => 10,
    ], $overrides));
}

beforeEach(function () {
    Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'TH', 'enabled' => true]);
    Locale::firstOrCreate(['code' => 'en'], ['display_name' => 'EN', 'enabled' => true]);
});

test('importRow() creates a brand-new brand, leaving a blank NOT NULL sort_order to the DB default instead of NULL', function () {
    // Regression: an earlier draft explicitly wrote `null` for every blank
    // optional column, which crashed on brand-new records for any NOT NULL
    // column with only a DB-level default (brands.sort_order) — the fix
    // omits the key entirely so the DB default applies.
    $importer = ImportExportRegistry::importer('brands');
    $importer->importRow(['code' => 'met_brand_1', 'name' => 'Test Brand', 'is_active' => '1'], metImportConfig('brands'));

    $brand = Brand::where('code', 'met_brand_1')->first();
    expect($brand)->not->toBeNull();
    expect($brand->sort_order)->toBe(0);
    expect($brand->is_active)->toBeTrue();
});

test('importRow() updating an existing brand preserves a blank optional column instead of clearing it', function () {
    $importer = ImportExportRegistry::importer('brands');
    $config = metImportConfig('brands');
    $importer->importRow(['code' => 'met_brand_2', 'name' => 'First', 'slug' => 'first-slug', 'is_active' => '1'], $config);

    // Re-import without slug — must NOT wipe the existing slug.
    $importer->importRow(['code' => 'met_brand_2', 'name' => 'Second'], $config);

    $brand = Brand::where('code', 'met_brand_2')->first();
    expect($brand->name)->toBe('Second');
    expect($brand->slug)->toBe('first-slug');
});

test('exporter() round-trips a brand back out with the same fields', function () {
    $config = metImportConfig('brands');
    ImportExportRegistry::importer('brands')->importRow(['code' => 'met_brand_3', 'name' => 'Export Me', 'is_active' => '0'], $config);

    $rows = iterator_to_array(ImportExportRegistry::exporter('brands')->rows(new \App\Models\ExportConfig()));
    $row = collect($rows)->firstWhere('code', 'met_brand_3');

    expect($row['name'])->toBe('Export Me');
    expect($row['is_active'])->toBe('0');
});

test('importRow() for points uses point_type as the key column (no code column at all)', function () {
    $importer = ImportExportRegistry::importer('points');
    $importer->importRow(['point_type' => 'ก', 'point_ratio' => '1.5', 'is_active' => '1'], metImportConfig('points'));

    $point = Point::where('point_type', 'ก')->first();
    expect($point)->not->toBeNull();
    expect((float) $point->point_ratio)->toBe(1.5);
});

test('importRow() for commission_groups writes p_group_name directly with no translation table involved', function () {
    $importer = ImportExportRegistry::importer('commission_groups');
    $importer->importRow(['code' => 'met_cg_1', 'p_group_name' => 'Sales Team A', 'divisor_start' => '2.0', 'is_active' => '1'], metImportConfig('commission_groups'));

    $group = CommissionGroup::where('code', 'met_cg_1')->first();
    expect($group->p_group_name)->toBe('Sales Team A');
    expect((float) $group->divisor_start)->toBe(2.0);
});

test('importRow() for vendors resolves currency_id from a currency_code column', function () {
    $currency = Currency::create(['code' => 'met_thb', 'name' => 'Test Baht', 'exchange_rate' => 1]);

    $importer = ImportExportRegistry::importer('vendors');
    $importer->importRow(['code' => 'met_vendor_1', 'name' => 'Test Vendor', 'currency_code' => 'met_thb', 'is_active' => '1'], metImportConfig('vendors'));

    $vendor = Vendor::where('code', 'met_vendor_1')->first();
    expect($vendor->currency_id)->toBe($currency->id);
});

test('importRow() for vendors rejects an unknown currency_code', function () {
    $importer = ImportExportRegistry::importer('vendors');

    expect(fn () => $importer->importRow(
        ['code' => 'met_vendor_2', 'name' => 'Test Vendor', 'currency_code' => 'no_such_currency'],
        metImportConfig('vendors')
    ))->toThrow(RowImportException::class);
});

test('importRow() rejects a malformed date column', function () {
    $importer = ImportExportRegistry::importer('product_grades');

    expect(fn () => $importer->importRow(
        ['code' => 'met_grade_1', 'name' => 'Grade X', 'start_date' => 'not-a-date'],
        metImportConfig('product_grades')
    ))->toThrow(RowImportException::class);

    expect(ProductGrade::where('code', 'met_grade_1')->exists())->toBeFalse();
});

test('importRow() with action=delete removes the matched record by its key column', function () {
    $importer = ImportExportRegistry::importer('brands');
    $importer->importRow(['code' => 'met_brand_delete', 'name' => 'Delete Me'], metImportConfig('brands'));
    expect(Brand::where('code', 'met_brand_delete')->exists())->toBeTrue();

    $importer->importRow(['code' => 'met_brand_delete'], metImportConfig('brands', ['action' => 'delete']));
    expect(Brand::where('code', 'met_brand_delete')->exists())->toBeFalse();
});

test('currencies has no is_active column and the generic importer does not try to write one', function () {
    $importer = ImportExportRegistry::importer('currencies');
    $importer->importRow(['code' => 'met_usd', 'name' => 'US Dollar', 'exchange_rate' => '35.5'], metImportConfig('currencies'));

    $currency = Currency::where('code', 'met_usd')->first();
    expect($currency)->not->toBeNull();
    expect((float) $currency->exchange_rate)->toBe(35.5);
});

test('all 9 master types are registered and produce non-empty columns/required lists', function () {
    foreach (['brands', 'base_units', 'points', 'commission_groups', 'business_types', 'vendors', 'currencies', 'product_grades', 'product_types'] as $type) {
        $importer = ImportExportRegistry::importer($type);
        expect($importer->columns())->not->toBeEmpty();
        expect($importer->requiredColumns())->not->toBeEmpty();
        expect(ImportExportRegistry::exporter($type))->not->toBeNull();
    }

    expect(ImportExportRegistry::TYPES)->toContain('brands', 'base_units', 'points', 'commission_groups', 'business_types', 'vendors', 'currencies', 'product_grades', 'product_types');
});
