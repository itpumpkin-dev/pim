<?php

declare(strict_types=1);

/**
 * Converts a WooCommerce product-export CSV into the CSV shape expected by
 * this app's product importer (app/Services/ImportExport/Importers/ProductRowImporter.php).
 *
 * Why this exists: the two formats do not line up column-for-column (see the
 * "KNOWN LIMITATIONS" block below) — this script does the mapping it safely
 * can, and reports everything it could not map so a human can decide what to
 * do about it (extend the importer, fix data by hand, accept the gap).
 *
 * Usage:
 *   php scripts/convert-woocommerce-import.php --in=productsPumpkin.csv --out=converted.csv
 *
 * Optional flags:
 *   --category-map=FILE   CSV with columns: woo_categories,pcatname,psubcatname,productgroupname
 *                          Overrides for rows whose "Categories" cell can't be
 *                          auto-matched (see --unmatched-report). Match key is
 *                          the exact, whitespace-normalized "Categories" cell text.
 *   --unmatched-report=FILE  Where to write categories that couldn't be matched
 *                             (default: <out>.unmatched-categories.csv)
 *   --family=CODE          Value to put in family_code for every row (must
 *                           already exist in attribute_families.code, e.g.
 *                           'general_chemical_product'). Default: blank.
 *   --no-name              Do not emit the pname column at all (see caveat below).
 *   --no-description       Do not emit the product_details_features column.
 *   --no-strip-html        Keep HTML markup in Name/Description instead of stripping it.
 *   --delimiter=,          CSV delimiter for BOTH input and output (default ',').
 *
 * KNOWN LIMITATIONS (read before trusting the output):
 *
 * 1. pname / product_details_features are locale-based attributes. The
 *    importer has no per-locale column syntax, so these land in the DB with
 *    locale_id = null instead of a real Thai/English translation row. If the
 *    storefront/admin UI only reads locale-scoped values, these may not show
 *    up anywhere. Treat this as "better than nothing", not a real fix.
 *    Disable with --no-name / --no-description if you'd rather leave them out
 *    entirely and set names by hand.
 *
 * 2. Categories: this app's category tree uses an internal ERP code scheme
 *    (database/data/{categories,subcategories,product_groups}.csv) that is a
 *    DIFFERENT taxonomy than a WooCommerce store's category tree. This script
 *    tries to match WooCommerce category names against the Thai/English names
 *    in that ERP data, but a name that doesn't happen to match exactly (or
 *    doesn't exist in the ERP taxonomy at all) will NOT be linked — the
 *    product still imports, it just won't have that category. Every row with
 *    an unmatched category gets logged to the unmatched-report file; use
 *    --category-map to supply manual overrides and re-run.
 *
 * 3. Only one price field survives: "Regular price" -> price_recommend.
 *    "Sale price" has nowhere to go (the closest field, price_std, is
 *    channel-scoped and not settable through this importer) and is dropped.
 *
 * 4. Only the first image URL survives (-> pimage). WooCommerce's Images
 *    column is a comma list; there's no multi-image field on this side, and
 *    no actual file-copy support at all — pimage just stores a URL string.
 *
 * 5. Type: only 'simple' and 'configurable' are accepted by the importer.
 *    Any other WooCommerce Type (variable/grouped/external) is coerced to
 *    'simple' and logged as a warning — review those rows manually.
 *
 * 6. Dropped entirely (no equivalent field exists): ID, Tags, Shipping class,
 *    Sale price, Purchase note, Position, Vehicles, Parent/Grouped
 *    products/Upsells/Cross-sells, External URL/Button text, all
 *    "Attribute N name/value(s)/visible/global" columns, Download limit/expiry.
 *
 * 7. "eol" is a heuristic: set to 1 if the word "EOL" appears in the Short
 *    description or Description, since this particular data set uses that
 *    convention. Verify a sample before trusting it broadly.
 */

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function argFlag(array $argv, string $name, ?string $default = null): ?string
{
    foreach ($argv as $arg) {
        if (str_starts_with($arg, "--{$name}=")) {
            return substr($arg, strlen("--{$name}="));
        }
    }
    return $default;
}

function hasFlag(array $argv, string $name): bool
{
    return in_array("--{$name}", $argv, true);
}

$inPath = argFlag($argv, 'in');
$outPath = argFlag($argv, 'out');
$categoryMapPath = argFlag($argv, 'category-map');
$familyCode = argFlag($argv, 'family', '');
$delimiter = argFlag($argv, 'delimiter', ',');
$emitName = !hasFlag($argv, 'no-name');
$emitDescription = !hasFlag($argv, 'no-description');
$stripHtml = !hasFlag($argv, 'no-strip-html');
$unmatchedReportPath = argFlag($argv, 'unmatched-report');

if (!$inPath || !$outPath) {
    fwrite(STDERR, "Usage: php scripts/convert-woocommerce-import.php --in=INPUT.csv --out=OUTPUT.csv [--category-map=map.csv] [--family=code] [--no-name] [--no-description] [--no-strip-html]\n");
    exit(1);
}

if (!is_file($inPath)) {
    fwrite(STDERR, "Input file not found: {$inPath}\n");
    exit(1);
}

$unmatchedReportPath ??= $outPath . '.unmatched-categories.csv';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function stripBomFromString(string $s): string
{
    return str_starts_with($s, "\xEF\xBB\xBF") ? substr($s, 3) : $s;
}

/** Trim + collapse internal whitespace, keep case (Thai has no case, and we
 *  want case-sensitive-safe matching for the rare Latin brand/category name). */
function normalizeName(string $s): string
{
    $s = trim($s);
    $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
    return mb_strtolower($s, 'UTF-8');
}

function stripHtmlToText(string $html): string
{
    $text = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/<(li|br|p|div|ul|ol)\b[^>]*>/i', "\n", $text) ?? $text;
    $text = strip_tags($text);
    $text = str_replace(['\\n', '\\t'], ["\n", ' '], $text); // literal escape sequences some exports leave behind
    $text = preg_replace('/[ \t]+/u', ' ', $text) ?? $text;
    $text = preg_replace('/\n{2,}/u', "\n", $text) ?? $text;
    return trim($text);
}

function firstImageUrl(string $cell): string
{
    $parts = array_map('trim', explode(',', $cell));
    return $parts[0] ?? '';
}

function mapType(string $wooType, ?string $sku, array &$warnings): string
{
    $t = strtolower(trim($wooType));
    if ($t === 'simple' || $t === 'configurable') {
        return $t;
    }
    if ($t !== '') {
        $warnings[] = "SKU '{$sku}': WooCommerce type '{$wooType}' is not supported (only simple/configurable) — coerced to 'simple', review manually.";
    }
    return 'simple';
}

function mapEnabled(string $published): string
{
    return trim($published) === '1' ? '1' : '0';
}

function detectEol(string ...$fields): string
{
    foreach ($fields as $field) {
        if (preg_match('/\bEOL\b/i', $field) === 1) {
            return '1';
        }
    }
    return '';
}

// ---------------------------------------------------------------------------
// Category lookup (built from the app's own ERP taxonomy source files)
// ---------------------------------------------------------------------------

function readSimpleCsv(string $path): array
{
    $handle = fopen($path, 'r');
    if ($handle === false) {
        throw new RuntimeException("Cannot open {$path}");
    }
    $first = fgets($handle);
    rewind($handle);
    $header = fgetcsv($handle);
    $header[0] = stripBomFromString((string) $header[0]);
    $rows = [];
    while (($data = fgetcsv($handle)) !== false) {
        if ($data === [null] || $data === false) {
            continue;
        }
        $rows[] = array_combine($header, array_pad($data, count($header), null));
    }
    fclose($handle);
    return $rows;
}

/**
 * Returns three lookup maps keyed by normalized name -> code (lowercased,
 * matching how CategoryTaxonomySeeder stores `categories.code`), built from
 * both the Thai and English name columns.
 */
function buildCategoryLookups(string $dataDir): array
{
    $categories = [];   // normalized name => code
    $subcategories = []; // normalized name => code
    $groups = [];       // normalized name => code

    foreach (readSimpleCsv($dataDir . '/categories.csv') as $row) {
        if (($row['pCatStatus'] ?? '') !== 'Active') {
            continue;
        }
        $code = strtolower(trim((string) $row['pCatID']));
        foreach ([$row['pCatName'] ?? '', $row['pCatNameENG'] ?? ''] as $name) {
            if (trim((string) $name) !== '') {
                $categories[normalizeName((string) $name)] = $code;
            }
        }
    }

    foreach (readSimpleCsv($dataDir . '/subcategories.csv') as $row) {
        if (($row['pSubCatStatus'] ?? '') !== 'Active') {
            continue;
        }
        $code = strtolower(trim((string) $row['pSubCatID']));
        foreach ([$row['pSubCatName'] ?? '', $row['pSubCatNameENG'] ?? ''] as $name) {
            if (trim((string) $name) !== '') {
                $subcategories[normalizeName((string) $name)] = $code;
            }
        }
    }

    foreach (readSimpleCsv($dataDir . '/product_groups.csv') as $row) {
        if (($row['ProductGroupStatus'] ?? '') !== 'Active') {
            continue;
        }
        $code = strtolower(trim((string) $row['ProductGroupID']));
        foreach ([$row['ProductGroupName'] ?? '', $row['ProductGroupNameENG'] ?? ''] as $name) {
            if (trim((string) $name) !== '') {
                $groups[normalizeName((string) $name)] = $code;
            }
        }
    }

    return [$categories, $subcategories, $groups];
}

function loadCategoryMapOverride(?string $path): array
{
    if ($path === null) {
        return [];
    }
    if (!is_file($path)) {
        fwrite(STDERR, "--category-map file not found: {$path}\n");
        exit(1);
    }
    $overrides = [];
    foreach (readSimpleCsv($path) as $row) {
        $key = normalizeName((string) ($row['woo_categories'] ?? ''));
        if ($key === '') {
            continue;
        }
        $overrides[$key] = [
            'pcatname' => trim((string) ($row['pcatname'] ?? '')),
            'psubcatname' => trim((string) ($row['psubcatname'] ?? '')),
            'productgroupname' => trim((string) ($row['productgroupname'] ?? '')),
        ];
    }
    return $overrides;
}

/**
 * Given a WooCommerce "Categories" cell (comma-separated list of " > "
 * hierarchy paths), try every level of every path against the product-group
 * lookup first (most specific), then subcategory, then category — the first
 * hit wins and the other two levels are derived from its code prefix rather
 * than requiring an independent name match (product_groups.csv IDs are
 * "<subcat code><3 digits>", subcategory IDs are "<cat letter><3 digits>").
 *
 * @return array{0: array{pcatname:string,psubcatname:string,productgroupname:string}, 1: bool}
 *         [codes, matched]
 */
function matchCategoryCell(
    string $cell,
    array $categories,
    array $subcategories,
    array $groups,
    array $overrides
): array {
    $empty = ['pcatname' => '', 'psubcatname' => '', 'productgroupname' => ''];

    $cell = trim($cell);
    if ($cell === '') {
        return [$empty, true]; // nothing to match, not an error
    }

    $normalizedCell = normalizeName($cell);
    if (isset($overrides[$normalizedCell])) {
        return [$overrides[$normalizedCell], true];
    }

    $paths = array_map('trim', explode(',', $cell));

    foreach ($paths as $path) {
        $levels = array_map('trim', explode('>', $path));
        // Try deepest level first, walking back toward the root.
        for ($i = count($levels) - 1; $i >= 0; $i--) {
            $name = normalizeName($levels[$i]);
            if ($name === '') {
                continue;
            }

            if (isset($groups[$name])) {
                $groupCode = $groups[$name];
                $subCode = substr($groupCode, 0, 4);
                $catCode = substr($groupCode, 0, 1);
                return [[
                    'pcatname' => $catCode,
                    'psubcatname' => $subCode,
                    'productgroupname' => $groupCode,
                ], true];
            }

            if (isset($subcategories[$name])) {
                $subCode = $subcategories[$name];
                $catCode = substr($subCode, 0, 1);
                return [[
                    'pcatname' => $catCode,
                    'psubcatname' => $subCode,
                    'productgroupname' => '',
                ], true];
            }

            if (isset($categories[$name])) {
                return [[
                    'pcatname' => $categories[$name],
                    'psubcatname' => '',
                    'productgroupname' => '',
                ], true];
            }
        }
    }

    return [$empty, false];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

$dataDir = __DIR__ . '/../database/data';
[$categoryLookup, $subcategoryLookup, $groupLookup] = buildCategoryLookups($dataDir);
$categoryOverrides = loadCategoryMapOverride($categoryMapPath);

$in = fopen($inPath, 'r');
if ($in === false) {
    fwrite(STDERR, "Cannot open input file: {$inPath}\n");
    exit(1);
}

$header = fgetcsv($in, 0, $delimiter);
if ($header === false) {
    fwrite(STDERR, "Input file has no header row.\n");
    exit(1);
}
$header = array_map(static fn ($h) => stripBomFromString(trim((string) $h)), $header);
$headerCount = count($header);

$outHeader = [
    'sku', 'family_code', 'type', 'enabled',
    'pbrand', 'pcatname', 'psubcatname', 'productgroupname',
    'barcode_pcs', 'qty', 'weight_pcs', 'length_pcs', 'width_pcs', 'height_pcs',
    'price_recommend', 'pimage', 'eol',
];
if ($emitName) {
    $outHeader[] = 'pname';
}
if ($emitDescription) {
    $outHeader[] = 'product_details_features';
}

$out = fopen($outPath, 'w');
if ($out === false) {
    fwrite(STDERR, "Cannot open output file: {$outPath}\n");
    exit(1);
}
fputcsv($out, $outHeader, $delimiter);

$rowCount = 0;
$skuMissingCount = 0;
$categoryMatchedCount = 0;
$categoryUnmatchedCount = 0;
$typeWarnings = [];
/** @var array<string,int> $unmatchedCategories normalized cell => count */
$unmatchedCategories = [];
/** @var array<string,string> $unmatchedCategoriesRaw normalized cell => original text */
$unmatchedCategoriesRaw = [];

while (($row = fgetcsv($in, 0, $delimiter)) !== false) {
    if ($row === [null]) {
        continue; // blank line
    }
    $row = array_slice(array_pad($row, $headerCount, null), 0, $headerCount);
    $r = array_combine($header, $row);
    $rowCount++;

    $sku = trim((string) ($r['SKU'] ?? ''));
    if ($sku === '') {
        $skuMissingCount++;
        continue; // cannot import a row without a SKU — importer requires it
    }

    [$catCodes, $matched] = matchCategoryCell(
        (string) ($r['Categories'] ?? ''),
        $categoryLookup,
        $subcategoryLookup,
        $groupLookup,
        $categoryOverrides
    );

    $categoriesCell = trim((string) ($r['Categories'] ?? ''));
    if ($categoriesCell !== '') {
        if ($matched) {
            $categoryMatchedCount++;
        } else {
            $categoryUnmatchedCount++;
            $key = normalizeName($categoriesCell);
            $unmatchedCategories[$key] = ($unmatchedCategories[$key] ?? 0) + 1;
            $unmatchedCategoriesRaw[$key] = $categoriesCell;
        }
    }

    $shortDesc = (string) ($r['Short description'] ?? '');
    $fullDesc = (string) ($r['Description'] ?? '');

    $outRow = [
        'sku' => $sku,
        'family_code' => $familyCode,
        'type' => mapType((string) ($r['Type'] ?? ''), $sku, $typeWarnings),
        'enabled' => mapEnabled((string) ($r['Published'] ?? '')),
        'pbrand' => trim((string) ($r['Brands'] ?? '')),
        'pcatname' => $catCodes['pcatname'],
        'psubcatname' => $catCodes['psubcatname'],
        'productgroupname' => $catCodes['productgroupname'],
        'barcode_pcs' => trim((string) ($r['GTIN, UPC, EAN, or ISBN'] ?? '')),
        'qty' => trim((string) ($r['Stock'] ?? '')),
        'weight_pcs' => trim((string) ($r['Weight (kg)'] ?? '')),
        'length_pcs' => trim((string) ($r['Length (cm)'] ?? '')),
        'width_pcs' => trim((string) ($r['Width (cm)'] ?? '')),
        'height_pcs' => trim((string) ($r['Height (cm)'] ?? '')),
        'price_recommend' => trim((string) ($r['Regular price'] ?? '')),
        'pimage' => firstImageUrl((string) ($r['Images'] ?? '')),
        'eol' => detectEol($shortDesc, $fullDesc),
    ];

    if ($emitName) {
        $name = (string) ($r['Name'] ?? '');
        $outRow['pname'] = $stripHtml ? stripHtmlToText($name) : $name;
    }
    if ($emitDescription) {
        $desc = $fullDesc !== '' ? $fullDesc : $shortDesc;
        $outRow['product_details_features'] = $stripHtml ? stripHtmlToText($desc) : $desc;
    }

    fputcsv($out, array_values($outRow), $delimiter);
}

fclose($in);
fclose($out);

// ---------------------------------------------------------------------------
// Unmatched-category report
// ---------------------------------------------------------------------------

if (!empty($unmatchedCategories)) {
    $report = fopen($unmatchedReportPath, 'w');
    fputcsv($report, ['woo_categories', 'row_count', 'pcatname', 'psubcatname', 'productgroupname'], $delimiter);
    arsort($unmatchedCategories);
    foreach ($unmatchedCategories as $key => $count) {
        fputcsv($report, [$unmatchedCategoriesRaw[$key], $count, '', '', ''], $delimiter);
    }
    fclose($report);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

fwrite(STDOUT, "Converted {$rowCount} row(s) -> {$outPath}\n");
if ($skuMissingCount > 0) {
    fwrite(STDOUT, "Skipped {$skuMissingCount} row(s) with no SKU.\n");
}
fwrite(STDOUT, "Categories matched: {$categoryMatchedCount}, unmatched: {$categoryUnmatchedCount}.\n");
if (!empty($unmatchedCategories)) {
    fwrite(STDOUT, "Unmatched category paths written to: {$unmatchedReportPath}\n");
    fwrite(STDOUT, "Fill in pcatname/psubcatname/productgroupname there, then re-run with --category-map={$unmatchedReportPath}\n");
}
if (!empty($typeWarnings)) {
    fwrite(STDOUT, "\n" . count($typeWarnings) . " type warning(s):\n");
    foreach (array_slice($typeWarnings, 0, 20) as $w) {
        fwrite(STDOUT, "  - {$w}\n");
    }
    if (count($typeWarnings) > 20) {
        fwrite(STDOUT, '  ... and ' . (count($typeWarnings) - 20) . " more.\n");
    }
}
if ($emitName || $emitDescription) {
    fwrite(STDOUT, "\nNOTE: pname/product_details_features are locale-based fields with no per-locale\n");
    fwrite(STDOUT, "import support — they will be stored with locale_id=null. Verify this renders\n");
    fwrite(STDOUT, "correctly before relying on it, or re-run with --no-name --no-description.\n");
}
fwrite(STDOUT, "\nDropped entirely (no equivalent field): ID, Tags, Sale price, Shipping class,\n");
fwrite(STDOUT, "Purchase note, Position, Vehicles, Parent/Grouped/Upsells/Cross-sells,\n");
fwrite(STDOUT, "External URL/Button text, Attribute N columns, Download limit/expiry.\n");
