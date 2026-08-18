<?php

namespace App\Services\ImportExport;

/**
 * Maps a WooCommerce product-export CSV onto the column shape ProductRowImporter
 * expects (see that class for the authoritative list of supported columns).
 * The two formats don't line up field-for-field — this only carries over what
 * has a real equivalent on this side and reports the rest, it does not
 * silently invent data. See docblock notes inline for each caveat; the same
 * caveats are also surfaced to the user on the result page.
 *
 * Ported from the CLI prototype at scripts/convert-woocommerce-import.php —
 * keep both in sync if the mapping rules change, or retire the CLI script in
 * favor of this one.
 */
class WooCommerceConverter
{
    /** @var array<string,string> normalized name => code */
    private array $categoryLookup = [];

    /** @var array<string,string> normalized name => code */
    private array $subcategoryLookup = [];

    /** @var array<string,string> normalized name => code */
    private array $groupLookup = [];

    public function __construct(?string $dataDir = null)
    {
        $dataDir ??= database_path('data');
        [$this->categoryLookup, $this->subcategoryLookup, $this->groupLookup] = self::buildCategoryLookups($dataDir);
    }

    /**
     * @param  string  $inputPath  Path to the uploaded WooCommerce CSV.
     * @param  array{family_code?:string,emit_name?:bool,emit_description?:bool,strip_html?:bool,category_map_path?:string}  $options
     * @return array{csv:string,unmatchedCsv:?string,summary:array<string,mixed>}
     */
    public function convert(string $inputPath, array $options = []): array
    {
        $familyCode = trim((string) ($options['family_code'] ?? ''));
        $emitName = $options['emit_name'] ?? true;
        $emitDescription = $options['emit_description'] ?? true;
        $stripHtml = $options['strip_html'] ?? true;
        $overrides = isset($options['category_map_path'])
            ? $this->loadCategoryMapOverride($options['category_map_path'])
            : [];

        $in = fopen($inputPath, 'r');
        if ($in === false) {
            throw new \RuntimeException("Cannot open input file: {$inputPath}");
        }

        $header = fgetcsv($in, 0, ',');
        if ($header === false) {
            fclose($in);
            throw new \RuntimeException('Input file has no header row.');
        }
        $header = array_map(static fn ($h) => self::stripBom(trim((string) $h)), $header);
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

        $out = fopen('php://temp', 'r+');
        fputcsv($out, $outHeader);

        $rowCount = 0;
        $skuMissingCount = 0;
        $categoryMatchedCount = 0;
        $categoryUnmatchedCount = 0;
        $typeWarnings = [];
        /** @var array<string,int> $unmatchedCategories */
        $unmatchedCategories = [];
        /** @var array<string,string> $unmatchedCategoriesRaw */
        $unmatchedCategoriesRaw = [];

        while (($row = fgetcsv($in, 0, ',')) !== false) {
            if ($row === [null]) {
                continue;
            }
            $row = array_slice(array_pad($row, $headerCount, null), 0, $headerCount);
            $r = array_combine($header, $row);
            $rowCount++;

            $sku = trim((string) ($r['SKU'] ?? ''));
            if ($sku === '') {
                $skuMissingCount++;
                continue;
            }

            [$catCodes, $matched] = self::matchCategoryCell(
                (string) ($r['Categories'] ?? ''),
                $this->categoryLookup,
                $this->subcategoryLookup,
                $this->groupLookup,
                $overrides
            );

            $categoriesCell = trim((string) ($r['Categories'] ?? ''));
            if ($categoriesCell !== '') {
                if ($matched) {
                    $categoryMatchedCount++;
                } else {
                    $categoryUnmatchedCount++;
                    $key = self::normalizeName($categoriesCell);
                    $unmatchedCategories[$key] = ($unmatchedCategories[$key] ?? 0) + 1;
                    $unmatchedCategoriesRaw[$key] = $categoriesCell;
                }
            }

            $shortDesc = (string) ($r['Short description'] ?? '');
            $fullDesc = (string) ($r['Description'] ?? '');

            $outRow = [
                'sku' => $sku,
                'family_code' => $familyCode,
                'type' => self::mapType((string) ($r['Type'] ?? ''), $sku, $typeWarnings),
                'enabled' => self::mapEnabled((string) ($r['Published'] ?? '')),
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
                'pimage' => self::firstImageUrl((string) ($r['Images'] ?? '')),
                'eol' => self::detectEol($shortDesc, $fullDesc),
            ];

            if ($emitName) {
                $name = (string) ($r['Name'] ?? '');
                $outRow['pname'] = $stripHtml ? self::stripHtmlToText($name) : $name;
            }
            if ($emitDescription) {
                $desc = $fullDesc !== '' ? $fullDesc : $shortDesc;
                $outRow['product_details_features'] = $stripHtml ? self::stripHtmlToText($desc) : $desc;
            }

            fputcsv($out, array_values($outRow));
        }
        fclose($in);

        rewind($out);
        $csv = stream_get_contents($out);
        fclose($out);

        $unmatchedCsv = null;
        if (!empty($unmatchedCategories)) {
            $rep = fopen('php://temp', 'r+');
            fputcsv($rep, ['woo_categories', 'row_count', 'pcatname', 'psubcatname', 'productgroupname']);
            arsort($unmatchedCategories);
            foreach ($unmatchedCategories as $key => $count) {
                fputcsv($rep, [$unmatchedCategoriesRaw[$key], $count, '', '', '']);
            }
            rewind($rep);
            $unmatchedCsv = stream_get_contents($rep);
            fclose($rep);
        }

        return [
            'csv' => $csv,
            'unmatchedCsv' => $unmatchedCsv,
            'summary' => [
                'row_count' => $rowCount,
                'sku_missing_count' => $skuMissingCount,
                'category_matched_count' => $categoryMatchedCount,
                'category_unmatched_count' => $categoryUnmatchedCount,
                'type_warnings' => array_slice($typeWarnings, 0, 50),
                'type_warnings_total' => count($typeWarnings),
                'emitted_name' => $emitName,
                'emitted_description' => $emitDescription,
            ],
        ];
    }

    private static function stripBom(string $s): string
    {
        return str_starts_with($s, "\xEF\xBB\xBF") ? substr($s, 3) : $s;
    }

    private static function normalizeName(string $s): string
    {
        $s = trim($s);
        $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
        return mb_strtolower($s, 'UTF-8');
    }

    private static function stripHtmlToText(string $html): string
    {
        $text = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/<(li|br|p|div|ul|ol)\b[^>]*>/i', "\n", $text) ?? $text;
        $text = strip_tags($text);
        $text = str_replace(['\\n', '\\t'], ["\n", ' '], $text);
        $text = preg_replace('/[ \t]+/u', ' ', $text) ?? $text;
        $text = preg_replace('/\n{2,}/u', "\n", $text) ?? $text;
        return trim($text);
    }

    private static function firstImageUrl(string $cell): string
    {
        $parts = array_map('trim', explode(',', $cell));
        return $parts[0] ?? '';
    }

    /** @param array<int,string> $warnings */
    private static function mapType(string $wooType, string $sku, array &$warnings): string
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

    private static function mapEnabled(string $published): string
    {
        return trim($published) === '1' ? '1' : '0';
    }

    private static function detectEol(string ...$fields): string
    {
        foreach ($fields as $field) {
            if (preg_match('/\bEOL\b/i', $field) === 1) {
                return '1';
            }
        }
        return '';
    }

    /**
     * @return array{0:array<string,array<string,string>>,1:array<int,array<string,string>>}
     */
    private static function readSimpleCsv(string $path): array
    {
        $handle = fopen($path, 'r');
        if ($handle === false) {
            throw new \RuntimeException("Cannot open {$path}");
        }
        $header = fgetcsv($handle);
        $header[0] = self::stripBom((string) $header[0]);
        $rows = [];
        while (($data = fgetcsv($handle)) !== false) {
            if ($data === [null]) {
                continue;
            }
            $rows[] = array_combine($header, array_pad($data, count($header), null));
        }
        fclose($handle);
        return $rows;
    }

    /** @return array{0:array<string,string>,1:array<string,string>,2:array<string,string>} */
    private static function buildCategoryLookups(string $dataDir): array
    {
        $categories = [];
        $subcategories = [];
        $groups = [];

        foreach (self::readSimpleCsv($dataDir . '/categories.csv') as $row) {
            if (($row['pCatStatus'] ?? '') !== 'Active') {
                continue;
            }
            $code = strtolower(trim((string) $row['pCatID']));
            foreach ([$row['pCatName'] ?? '', $row['pCatNameENG'] ?? ''] as $name) {
                if (trim((string) $name) !== '') {
                    $categories[self::normalizeName((string) $name)] = $code;
                }
            }
        }

        foreach (self::readSimpleCsv($dataDir . '/subcategories.csv') as $row) {
            if (($row['pSubCatStatus'] ?? '') !== 'Active') {
                continue;
            }
            $code = strtolower(trim((string) $row['pSubCatID']));
            foreach ([$row['pSubCatName'] ?? '', $row['pSubCatNameENG'] ?? ''] as $name) {
                if (trim((string) $name) !== '') {
                    $subcategories[self::normalizeName((string) $name)] = $code;
                }
            }
        }

        foreach (self::readSimpleCsv($dataDir . '/product_groups.csv') as $row) {
            if (($row['ProductGroupStatus'] ?? '') !== 'Active') {
                continue;
            }
            $code = strtolower(trim((string) $row['ProductGroupID']));
            foreach ([$row['ProductGroupName'] ?? '', $row['ProductGroupNameENG'] ?? ''] as $name) {
                if (trim((string) $name) !== '') {
                    $groups[self::normalizeName((string) $name)] = $code;
                }
            }
        }

        return [$categories, $subcategories, $groups];
    }

    /** @return array<string,array{pcatname:string,psubcatname:string,productgroupname:string}> */
    private function loadCategoryMapOverride(string $path): array
    {
        $overrides = [];
        foreach (self::readSimpleCsv($path) as $row) {
            $key = self::normalizeName((string) ($row['woo_categories'] ?? ''));
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
     * @param  array<string,string>  $categories
     * @param  array<string,string>  $subcategories
     * @param  array<string,string>  $groups
     * @param  array<string,array{pcatname:string,psubcatname:string,productgroupname:string}>  $overrides
     * @return array{0:array{pcatname:string,psubcatname:string,productgroupname:string},1:bool}
     */
    private static function matchCategoryCell(
        string $cell,
        array $categories,
        array $subcategories,
        array $groups,
        array $overrides
    ): array {
        $empty = ['pcatname' => '', 'psubcatname' => '', 'productgroupname' => ''];

        $cell = trim($cell);
        if ($cell === '') {
            return [$empty, true];
        }

        $normalizedCell = self::normalizeName($cell);
        if (isset($overrides[$normalizedCell])) {
            return [$overrides[$normalizedCell], true];
        }

        $paths = array_map('trim', explode(',', $cell));

        foreach ($paths as $path) {
            $levels = array_map('trim', explode('>', $path));
            for ($i = count($levels) - 1; $i >= 0; $i--) {
                $name = self::normalizeName($levels[$i]);
                if ($name === '') {
                    continue;
                }

                if (isset($groups[$name])) {
                    $groupCode = $groups[$name];
                    return [[
                        'pcatname' => substr($groupCode, 0, 1),
                        'psubcatname' => substr($groupCode, 0, 4),
                        'productgroupname' => $groupCode,
                    ], true];
                }

                if (isset($subcategories[$name])) {
                    $subCode = $subcategories[$name];
                    return [[
                        'pcatname' => substr($subCode, 0, 1),
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
}
