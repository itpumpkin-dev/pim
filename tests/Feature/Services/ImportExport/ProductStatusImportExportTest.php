<?php

use App\Models\Attribute;
use App\Models\ExportConfig;
use App\Models\ImportConfig;
use App\Models\Product;
use App\Services\ImportExport\Exporters\ProductRowExporter;
use App\Services\ImportExport\Importers\ProductRowImporter;
use App\Services\ImportExport\RowImportException;

/**
 * คอลัมน์ `status` (products.status) ใน import/export สินค้า
 */
function psImportConfig(): ImportConfig
{
    return ImportConfig::create([
        'code' => 'ps_config_'.uniqid(),
        'type' => 'products',
        'file_format' => 'csv',
        'field_separator' => ',',
        'action' => 'create_update',
        'validation_strategy' => 'skip_errors',
        'ai_translate' => false,
        'allowed_errors' => 10,
    ]);
}

test('import sets status from the status column, case-insensitively', function () {
    (new ProductRowImporter())->importRow(['sku' => 'PS-IMP-1', 'type' => 'simple', 'enabled' => '1', 'status' => 'Hold'], psImportConfig());

    expect(Product::where('sku', 'PS-IMP-1')->value('status'))->toBe('hold');
});

test('import gives a new product status new when the status column is blank', function () {
    (new ProductRowImporter())->importRow(['sku' => 'PS-IMP-2', 'type' => 'simple', 'enabled' => '1', 'status' => ''], psImportConfig());

    expect(Product::where('sku', 'PS-IMP-2')->value('status'))->toBe('new');
});

test('import leaves an existing product status alone when the status column is blank or missing', function () {
    Product::create(['sku' => 'PS-IMP-3', 'type' => 'simple', 'enabled' => true, 'status' => 'active']);

    (new ProductRowImporter())->importRow(['sku' => 'PS-IMP-3', 'type' => 'simple', 'enabled' => '1'], psImportConfig());

    expect(Product::where('sku', 'PS-IMP-3')->value('status'))->toBe('active');
});

test('import rejects an unknown status', function () {
    expect(fn () => (new ProductRowImporter())->importRow(
        ['sku' => 'PS-IMP-4', 'type' => 'simple', 'enabled' => '1', 'status' => 'archived'],
        psImportConfig(),
    ))->toThrow(RowImportException::class);

    expect(Product::where('sku', 'PS-IMP-4')->exists())->toBeFalse();
});

test('export includes the status column and still exports the first attribute column', function () {
    // code ขึ้นต้น "aaa" ให้เป็นคอลัมน์ attribute ตัวแรกเสมอ — เดิม array_slice(…, 4)
    // ตัดคอลัมน์นี้ทิ้งไป ตั้งแต่ FIXED_COLUMNS เหลือแค่ 3 ตัว
    Attribute::create(['code' => 'aaa_ps_first_attr', 'type' => 'text']);
    Product::create(['sku' => 'PS-EXP-1', 'type' => 'simple', 'enabled' => true, 'status' => 'delete']);

    $exporter = new ProductRowExporter();
    expect($exporter->columns())->toContain('status');

    $row = collect(iterator_to_array($exporter->rows(new ExportConfig())))->firstWhere('sku', 'PS-EXP-1');

    expect($row['status'])->toBe('delete');
    expect($row)->toHaveKey('aaa_ps_first_attr');
});
