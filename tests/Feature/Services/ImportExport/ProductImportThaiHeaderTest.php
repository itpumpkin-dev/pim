<?php

use App\Services\ImportExport\Importers\ProductRowImporter;
use App\Services\ImportExport\RowHeaderNormalizer;

/**
 * ProcessImportJob รันใน queue worker ใต้ APP_LOCALE (en) — ไฟล์ template ที่
 * ดาวน์โหลดจากหน้าจอภาษาไทยมีหัวคอลัมน์ภาษาไทย ต้องยัง map กลับเป็น code ได้
 */
test('a Thai template header row still maps back to sku/type/enabled/status while running under en', function () {
    app()->setLocale('en');

    $labels = RowHeaderNormalizer::labelsForAllLocales(fn () => (new ProductRowImporter())->columnLabels(), ['th', 'en']);

    $row = RowHeaderNormalizer::normalize(
        ['รหัสสินค้า (SKU)' => 'X-1', 'ประเภท' => 'simple', 'เปิดใช้งาน' => '1', 'สถานะสินค้า' => 'active'],
        $labels,
    );

    expect($row)->toBe(['sku' => 'X-1', 'type' => 'simple', 'enabled' => '1', 'status' => 'active']);
    expect(app()->getLocale())->toBe('en');
});
