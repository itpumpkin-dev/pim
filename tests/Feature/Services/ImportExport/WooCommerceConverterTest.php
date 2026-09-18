<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\Locale;
use App\Models\WooCategoryAlias;
use App\Services\ImportExport\WooCommerceConverter;

/** Writes $rows (each an assoc array keyed by column name) as a CSV file and returns its path. */
function writeCsv(string $dir, string $filename, array $header, array $rows): string
{
    $path = $dir.'/'.$filename;
    $handle = fopen($path, 'w');
    fputcsv($handle, $header);
    foreach ($rows as $row) {
        fputcsv($handle, array_map(fn ($col) => $row[$col] ?? '', $header));
    }
    fclose($handle);

    return $path;
}

/** Sets up a category-master data dir (categories/subcategories/product_groups.csv) for the converter's constructor. */
function makeCategoryDataDir(): string
{
    $dir = sys_get_temp_dir().'/wc_converter_test_'.uniqid();
    mkdir($dir);

    writeCsv($dir, 'categories.csv', ['pCatID', 'pCatName', 'pCatNameENG', 'pCatStatus'], [
        ['pCatID' => 'a', 'pCatName' => 'เครื่องมือ', 'pCatNameENG' => 'Tools', 'pCatStatus' => 'Active'],
    ]);
    writeCsv($dir, 'subcategories.csv', ['pSubCatID', 'pSubCatName', 'pSubCatNameENG', 'pSubCatStatus'], [
        ['pSubCatID' => 'a025', 'pSubCatName' => 'เครื่องมือไฟฟ้า', 'pSubCatNameENG' => 'Power Tools', 'pSubCatStatus' => 'Active'],
    ]);
    writeCsv($dir, 'product_groups.csv', ['ProductGroupID', 'ProductGroupName', 'ProductGroupNameENG', 'ProductGroupStatus'], [
        ['ProductGroupID' => 'a025001', 'ProductGroupName' => 'สายไฟ', 'ProductGroupNameENG' => 'Power Cords', 'ProductGroupStatus' => 'Active'],
    ]);

    return $dir;
}

const WOO_HEADER = [
    'SKU', 'Name', 'Type', 'Published', 'Brands', 'Categories',
    'GTIN, UPC, EAN, or ISBN', 'Stock', 'Weight (kg)', 'Length (cm)', 'Width (cm)', 'Height (cm)',
    'Regular price', 'Images', 'Short description', 'Description',
    'Meta: youtube_url', 'Meta: downloads_catalogue', 'Meta: specification', 'Meta: key_features', 'Meta: in-the-box',
    'Attribute 1 name', 'Attribute 1 value(s)',
];

/** @return array{0: array<string,mixed>, 1: string[]} [row keyed by output column, header list], from a raw CSV string */
function parseConvertedCsv(string $csv): array
{
    // fputcsv() (used by convert() to build this string) terminates lines
    // with a plain "\n" by default, not "\r\n".
    $lines = array_values(array_filter(explode("\n", $csv)));
    $header = str_getcsv($lines[0]);
    $rows = array_map(fn ($line) => array_combine($header, str_getcsv($line)), array_slice($lines, 1));

    return [$rows, $header];
}

beforeEach(function () {
    $this->dataDir = makeCategoryDataDir();
    $this->inputDir = sys_get_temp_dir().'/wc_converter_input_'.uniqid();
    mkdir($this->inputDir);
});

afterEach(function () {
    array_map('unlink', glob($this->dataDir.'/*'));
    rmdir($this->dataDir);
    array_map('unlink', glob($this->inputDir.'/*'));
    rmdir($this->inputDir);
});

test('converts a basic row: sku, type, enabled, stripped name, and a matched product-group category path', function () {
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [[
        'SKU' => 'SKU-1', 'Name' => '<p>Widget</p>', 'Type' => 'simple', 'Published' => '1',
        'Categories' => 'เครื่องมือ > เครื่องมือไฟฟ้า > สายไฟ',
    ]]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows)->toHaveCount(1);
    expect($rows[0]['sku'])->toBe('SKU-1');
    expect($rows[0]['type'])->toBe('simple');
    expect($rows[0]['enabled'])->toBe('1');
    expect($rows[0]['pname'])->toBe('Widget');
    expect($rows[0]['pcatname'])->toBe('a');
    expect($rows[0]['psubcatname'])->toBe('a025');
    expect($rows[0]['productgroupname'])->toBe('a025001');
    expect($result['summary']['row_count'])->toBe(1);
    expect($result['summary']['category_matched_count'])->toBe(1);
});

test('a row with no SKU is skipped and counted, not emitted', function () {
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [
        ['SKU' => '', 'Name' => 'No SKU'],
        ['SKU' => 'SKU-1', 'Name' => 'Has SKU'],
    ]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows)->toHaveCount(1);
    expect($result['summary']['sku_missing_count'])->toBe(1);
    expect($result['summary']['row_count'])->toBe(2);
});

test('emit_name=false and emit_description=false drop those columns from the output entirely', function () {
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [['SKU' => 'SKU-1', 'Name' => 'Widget']]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath, ['emit_name' => false, 'emit_description' => false]);

    [, $header] = parseConvertedCsv($result['csv']);
    expect($header)->not->toContain('pname', 'product_details_features');
    expect($result['summary']['emitted_name'])->toBeFalse();
});

test('an unmatched category is reported in the unmatched CSV with its raw text and row count', function () {
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [
        ['SKU' => 'SKU-1', 'Categories' => 'Totally Unknown Path'],
        ['SKU' => 'SKU-2', 'Categories' => 'Totally Unknown Path'],
    ]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath);

    expect($result['summary']['category_unmatched_count'])->toBe(2);
    expect($result['unmatchedCsv'])->toContain('Totally Unknown Path', '2');
});

test('stripHtml=false preserves raw HTML in the name and description fields', function () {
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [[
        'SKU' => 'SKU-1', 'Name' => '<b>Widget</b>', 'Description' => '<p>Full desc</p>',
    ]]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath, ['strip_html' => false]);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows[0]['pname'])->toBe('<b>Widget</b>');
});

test('an unsupported Type value is coerced to simple and recorded as a type warning naming the SKU', function () {
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [['SKU' => 'SKU-1', 'Type' => 'variable']]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows[0]['type'])->toBe('simple');
    expect($result['summary']['type_warnings'])->toHaveCount(1);
    expect($result['summary']['type_warnings'][0])->toContain('SKU-1');
});

test('resolves the corded/cordless power_type from the WooCommerce custom attribute columns', function () {
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [[
        'SKU' => 'SKU-1', 'Attribute 1 name' => 'ใช้สาย/ไร้สาย', 'Attribute 1 value(s)' => 'ไร้สาย',
    ]]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows[0]['power_type'])->toBe('cordless');
});

test('a brand matching an existing AttributeOption (by translation label) resolves to that option\'s code, not a new one', function () {
    $th = Locale::firstOrCreate(['code' => 'th'], ['enabled' => true]);
    $brandAttr = Attribute::create(['code' => 'pbrand', 'type' => 'select']);
    $option = AttributeOption::create(['attribute_id' => $brandAttr->id, 'code' => 'pumpkin', 'admin_label' => 'Pumpkin']);
    AttributeOptionTranslation::create(['attribute_option_id' => $option->id, 'locale_id' => $th->id, 'label' => 'พัมคิน']);

    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [['SKU' => 'SKU-1', 'Brands' => 'พัมคิน']]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows[0]['pbrand'])->toBe('pumpkin');
    expect($result['summary']['brand_new_count'])->toBe(0);
});

test('an unrecognized brand auto-creates a new AttributeOption and is reported as newly created', function () {
    Attribute::create(['code' => 'pbrand', 'type' => 'select']);
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [['SKU' => 'SKU-1', 'Brands' => 'Brand New Co']]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows[0]['pbrand'])->toMatch('/^brand_new_co/');
    expect($result['summary']['brand_new_count'])->toBe(1);
    expect($result['summary']['brand_new_names'])->toBe(['Brand New Co']);
    expect(AttributeOption::where('admin_label', 'Brand New Co')->exists())->toBeTrue();
});

test('a category_map_path override resolves an otherwise-unmatched category and is persisted as a reusable WooCategoryAlias', function () {
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [['SKU' => 'SKU-1', 'Categories' => 'Custom Path']]);
    $mapPath = writeCsv($this->inputDir, 'map.csv', ['woo_categories', 'pcatname', 'psubcatname', 'productgroupname'], [
        ['woo_categories' => 'Custom Path', 'pcatname' => 'a', 'psubcatname' => 'a025', 'productgroupname' => 'a025001'],
    ]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath, ['category_map_path' => $mapPath]);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows[0]['productgroupname'])->toBe('a025001');
    expect($result['summary']['category_aliases_saved_count'])->toBe(1);
    expect(WooCategoryAlias::where('match_key', 'custom path')->exists())->toBeTrue();
});

test('a previously-saved category alias auto-applies on a later conversion without re-uploading the map', function () {
    WooCategoryAlias::create([
        'match_key' => 'custom path', 'woo_category_text' => 'Custom Path',
        'pcatname' => 'a', 'psubcatname' => 'a025', 'productgroupname' => 'a025001',
    ]);
    $csvPath = writeCsv($this->inputDir, 'input.csv', WOO_HEADER, [['SKU' => 'SKU-1', 'Categories' => 'Custom Path']]);

    $converter = new WooCommerceConverter($this->dataDir);
    $result = $converter->convert($csvPath);

    [$rows] = parseConvertedCsv($result['csv']);
    expect($rows[0]['productgroupname'])->toBe('a025001');
    expect($result['summary']['category_matched_count'])->toBe(1);
});
