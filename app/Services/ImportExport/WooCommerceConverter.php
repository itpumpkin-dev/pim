<?php

namespace App\Services\ImportExport;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AuditLog;
use App\Models\WooCategoryAlias;
use Illuminate\Support\Str;

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
 * favor of this one. Note: the CLI script does NOT do the brand linking
 * described below (it has no DB access), so pbrand there still passes
 * through as raw Woo text.
 */
class WooCommerceConverter
{
    /** @var array<string,string> normalized name => code */
    private array $categoryLookup = [];

    /** @var array<string,string> normalized name => code */
    private array $subcategoryLookup = [];

    /** @var array<string,string> normalized name => code */
    private array $groupLookup = [];

    /**
     * pbrand is a select attribute — its ProductValue must be an
     * AttributeOption code, not free text (see ProductPresenter's
     * SELECT_CODES_TO_RESOLVE note). Built lazily in convert() since it
     * needs the DB. Null attribute id means the pbrand attribute doesn't
     * exist in this environment, so brand text is passed through unresolved.
     */
    private ?Attribute $brandAttribute = null;

    /** @var array<string,string> normalized brand name/code => AttributeOption code */
    private array $brandLookup = [];

    /** @var array<int,string> newly auto-created brand names, in encounter order */
    private array $newBrandNames = [];

    /** @var array<string,string> normalized match key => original (pre-normalization) woo_categories text, from the uploaded category_map file */
    private array $overrideRawText = [];

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
        $overrides = $this->loadCategoryAliases();
        if (isset($options['category_map_path'])) {
            $uploaded = $this->loadCategoryMapOverride($options['category_map_path']);
            $overrides = array_merge($overrides, $uploaded);
            $this->rememberCategoryAliases($uploaded);
        }

        $this->loadBrandLookup();

        $in = fopen($inputPath, 'r');
        if ($in === false) {
            throw new \RuntimeException("Cannot open input file: {$inputPath}");
        }

        // escape='' disables fgetcsv's non-standard backslash-escape handling
        // (PHP's default, unlike every other CSV parser incl. Excel/Python).
        // WooCommerce meta fields regularly contain JSON with its own \"
        // sequences (e.g. Meta: _elementor_data); with the default escape
        // char, fgetcsv treats a literal backslash right before a doubled
        // quote as un-escaping it, desyncing the quoted-field state for the
        // rest of the file — silently merging multiple physical rows into
        // one and shifting every later column's value into the wrong field,
        // with no error raised. Confirmed against storage/app/productimportFull.txt:
        // without this, row field counts drift far past the header count.
        $header = fgetcsv($in, 0, ',', '"', '');
        if ($header === false) {
            fclose($in);
            throw new \RuntimeException('Input file has no header row.');
        }
        $header = array_map(static fn ($h) => self::stripBom(trim((string) $h)), $header);
        $headerCount = count($header);

        // Every "Attribute N name" column present (Woo's per-product custom
        // attributes are numbered, not fixed — this file only goes up to 3,
        // but nothing caps it), used by resolvePowerType() to find whichever
        // one (if any) is the corded/cordless attribute.
        $attributeNameColumns = array_values(array_filter(
            $header,
            static fn ($h) => preg_match('/^Attribute \d+ name$/', $h) === 1
        ));

        $outHeader = [
            'sku', 'family_code', 'type', 'enabled',
            'pbrand', 'pcatname', 'psubcatname', 'productgroupname',
            'barcode_pcs', 'qty', 'weight_pcs', 'length_pcs', 'width_pcs', 'height_pcs',
            'price_recommend', 'pimage', 'eol', 'youtube_url', 'catalog_pdf', 'power_type',
        ];
        if ($emitName) {
            $outHeader[] = 'pname';
        }
        if ($emitDescription) {
            $outHeader[] = 'product_details_features';
            $outHeader[] = 'spec_specifications';
            $outHeader[] = 'spec_features';
            $outHeader[] = 'included_accessories';
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

        while (($row = fgetcsv($in, 0, ',', '"', '')) !== false) {
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
                'pbrand' => $this->resolveBrand((string) ($r['Brands'] ?? '')),
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
                'youtube_url' => trim((string) ($r['Meta: youtube_url'] ?? '')),
                'catalog_pdf' => trim((string) ($r['Meta: downloads_catalogue'] ?? '')),
                'power_type' => self::resolvePowerType($r, $attributeNameColumns),
            ];

            if ($emitName) {
                $name = (string) ($r['Name'] ?? '');
                $outRow['pname'] = $stripHtml ? self::stripHtmlToText($name) : $name;
            }
            if ($emitDescription) {
                $outRow['product_details_features'] = self::pickDescription($fullDesc, $shortDesc, $stripHtml);
                $outRow['spec_specifications'] = self::mapMetaField((string) ($r['Meta: specification'] ?? ''), $stripHtml);
                $outRow['spec_features'] = self::mapMetaField((string) ($r['Meta: key_features'] ?? ''), $stripHtml);
                $outRow['included_accessories'] = self::mapMetaField((string) ($r['Meta: in-the-box'] ?? ''), $stripHtml);
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
                'brand_new_count' => count($this->newBrandNames),
                'brand_new_names' => array_slice($this->newBrandNames, 0, 50),
                'brand_new_names_total' => count($this->newBrandNames),
            ],
        ];
    }

    /**
     * Loads every existing pbrand AttributeOption into brandLookup, keyed by
     * its code, its raw (untranslated) admin_label, AND every per-locale
     * translation label it has — normalized the same way category names
     * are. Matching on every translation (not just the current-locale one
     * or the raw admin_label) matters here specifically: several existing
     * brand options were entered with a Thai admin_label (e.g. "พัมคิน" for
     * Pumpkin) while WooCommerce exports carry the English brand name — an
     * English translation row on that option is what lets "PUMPKIN" resolve
     * to the same option instead of spawning a duplicate.
     */
    private function loadBrandLookup(): void
    {
        $attribute = Attribute::where('code', 'pbrand')->first();
        if (!$attribute) {
            return;
        }
        $this->brandAttribute = $attribute;

        foreach (AttributeOption::where('attribute_id', $attribute->id)->with('translations')->get() as $option) {
            $names = [$option->code, $option->getRawOriginal('admin_label')];
            foreach ($option->translations as $translation) {
                $names[] = $translation->label;
            }
            foreach ($names as $name) {
                if ($name !== null && trim((string) $name) !== '') {
                    $this->brandLookup[self::normalizeName((string) $name)] = $option->code;
                }
            }
        }
    }

    /**
     * Resolves a raw Woo "Brands" cell to a pbrand AttributeOption code,
     * auto-creating a new option (admin_label = the raw text) the first time
     * a given brand name is seen — there's no pre-existing brand list to map
     * against, unlike categories, so requiring a human to approve every
     * brand up front isn't practical. Every auto-created brand is reported
     * back in the conversion summary so it can be reviewed/renamed/merged
     * afterwards under Attributes > Brand.
     */
    private function resolveBrand(string $raw): string
    {
        $raw = trim($raw);
        if ($raw === '' || !$this->brandAttribute) {
            return $raw;
        }

        $key = self::normalizeName($raw);
        if (isset($this->brandLookup[$key])) {
            return $this->brandLookup[$key];
        }

        $code = $this->makeBrandOptionCode($raw);
        $option = AttributeOption::create([
            'attribute_id' => $this->brandAttribute->id,
            'code' => $code,
            'admin_label' => $raw,
            'sort_order' => 0,
        ]);

        AuditLog::record('option_created', $this->brandAttribute, null, [
            "option#{$option->id}.code" => $option->code,
            "option#{$option->id}.admin_label" => $raw,
            "option#{$option->id}.swatch_value" => null,
            "option#{$option->id}.sort_order" => 0,
        ]);

        $this->brandLookup[$key] = $code;
        $this->newBrandNames[] = $raw;

        return $code;
    }

    /**
     * Slugifies the brand name into a code matching what
     * AttributeOptionRowImporter accepts (^[a-z][a-z0-9_]*$), falling back
     * to a hash-based code for names that slugify to nothing (e.g. Thai-only
     * text Str::slug can't transliterate), and de-duping against every code
     * already used for pbrand this run.
     */
    private function makeBrandOptionCode(string $name): string
    {
        $slug = Str::slug($name, '_');
        if ($slug === '' || !preg_match('/^[a-z]/', $slug)) {
            $slug = 'brand_' . ($slug !== '' ? $slug : substr(md5($name), 0, 8));
        }

        $code = $slug;
        $i = 2;
        while (in_array($code, $this->brandLookup, true)) {
            $code = "{$slug}_{$i}";
            $i++;
        }

        return $code;
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

    /**
     * Also breaks on table rows/headings, not just the list/paragraph tags
     * the Name/Description fields use — Woo's "Meta: specification" field
     * (see mapMetaField()) is an HTML <table> of spec rows, and without this
     * every cell would run together on one unreadable line.
     */
    private static function stripHtmlToText(string $html): string
    {
        $text = html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/<(li|br|p|div|ul|ol|tr|h[1-6])\b[^>]*>/i', "\n", $text) ?? $text;
        $text = preg_replace('/<\/?(td|th)\b[^>]*>/i', ' ', $text) ?? $text;
        $text = strip_tags($text);
        $text = str_replace(['\\n', '\\t'], ["\n", ' '], $text);
        $text = preg_replace('/[ \t]+/u', ' ', $text) ?? $text;
        $text = preg_replace('/\n{2,}/u', "\n", $text) ?? $text;
        return trim($text);
    }

    /**
     * "Description" is frequently just an Elementor page-builder banner (an
     * <img>/lightbox anchor with no real text node) rather than prose, while
     * "Short description" carries the actual selling-point bullets — the
     * opposite of what you'd expect from the field names. Deciding by
     * stripped-text emptiness (not raw-HTML emptiness) means whichever field
     * actually has content wins, instead of always picking Description just
     * because it's non-blank markup.
     */
    private static function pickDescription(string $fullDesc, string $shortDesc, bool $stripHtml): string
    {
        $fullStripped = self::stripHtmlToText($fullDesc);
        $preferFull = $fullStripped !== '';

        if ($stripHtml) {
            return $preferFull ? $fullStripped : self::stripHtmlToText($shortDesc);
        }

        return $preferFull ? $fullDesc : $shortDesc;
    }

    /**
     * Shared handling for the three WooCommerce ACF meta fields with a clean
     * equivalent on this side (specification table -> spec_specifications,
     * key_features -> spec_features, in-the-box -> included_accessories).
     * All three are is_locale_based attributes, same as product_details_features,
     * so they carry the same "lands with locale_id=null" caveat — see the
     * class docblock and columnLabels() caveats surfaced on the result page.
     */
    private static function mapMetaField(string $raw, bool $stripHtml): string
    {
        return $stripHtml ? self::stripHtmlToText($raw) : $raw;
    }

    private static function firstImageUrl(string $cell): string
    {
        $parts = array_map('trim', explode(',', $cell));
        return $parts[0] ?? '';
    }

    /**
     * The value cell for a Woo "Attribute N value(s)" column, mapped to the
     * `power_type` AttributeOption code (see AttributeOptionCatalogSeeder).
     * Woo's custom attributes are unpredictable per product line — the only
     * one this app has a target for is corded/cordless, so every other
     * "Attribute N" pair (e.g. this file's "product-feature" = "Recommended"
     * badge) is left unmapped, same as before.
     */
    private const POWER_TYPE_VALUE_MAP = [
        'ใช้สาย' => 'corded',
        'ไร้สาย' => 'cordless',
        'corded' => 'corded',
        'cordless' => 'cordless',
    ];

    /**
     * An "Attribute N name" cell is treated as the corded/cordless attribute
     * when it mentions both Thai words for corded and cordless — matches
     * this file's literal name "ใช้สาย/ไร้สาย" without hardcoding its exact
     * punctuation/ordering, since other Woo exports may format it slightly
     * differently.
     *
     * @param  array<string,string>  $r  The current row, keyed by header.
     * @param  array<int,string>  $attributeNameColumns  Every "Attribute N name" header present.
     */
    private static function resolvePowerType(array $r, array $attributeNameColumns): string
    {
        foreach ($attributeNameColumns as $nameColumn) {
            $name = self::normalizeName((string) ($r[$nameColumn] ?? ''));
            if ($name === '' || !str_contains($name, 'ใช้สาย') || !str_contains($name, 'ไร้สาย')) {
                continue;
            }

            preg_match('/\d+/', $nameColumn, $matches);
            $valueColumn = "Attribute {$matches[0]} value(s)";
            $value = self::normalizeName((string) ($r[$valueColumn] ?? ''));

            if (isset(self::POWER_TYPE_VALUE_MAP[$value])) {
                return self::POWER_TYPE_VALUE_MAP[$value];
            }
        }

        return '';
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
        $header = fgetcsv($handle, 0, ',', '"', '');
        $header[0] = self::stripBom((string) $header[0]);
        $rows = [];
        while (($data = fgetcsv($handle, 0, ',', '"', '')) !== false) {
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

    /**
     * Every previously-saved Category Mapping row (see rememberCategoryAliases()),
     * keyed the same way an uploaded category_map file is — so a Woo
     * "Categories" cell resolved once (by hand, via an upload) auto-resolves
     * on every later conversion without re-uploading that file.
     *
     * @return array<string,array{pcatname:string,psubcatname:string,productgroupname:string}>
     */
    private function loadCategoryAliases(): array
    {
        $aliases = [];
        foreach (WooCategoryAlias::all() as $alias) {
            $aliases[$alias->match_key] = [
                'pcatname' => (string) $alias->pcatname,
                'psubcatname' => (string) $alias->psubcatname,
                'productgroupname' => (string) $alias->productgroupname,
            ];
        }
        return $aliases;
    }

    /**
     * Persists an uploaded category_map file's rows as WooCategoryAlias
     * records (upserted by match_key) so future conversions apply them
     * automatically — this is what makes an uploaded mapping "permanent".
     *
     * @param  array<string,array{pcatname:string,psubcatname:string,productgroupname:string}>  $overrides
     */
    private function rememberCategoryAliases(array $overrides): void
    {
        foreach ($overrides as $matchKey => $codes) {
            if ($codes['pcatname'] === '' && $codes['psubcatname'] === '' && $codes['productgroupname'] === '') {
                continue;
            }
            WooCategoryAlias::updateOrCreate(
                ['match_key' => $matchKey],
                [
                    'woo_category_text' => $this->overrideRawText[$matchKey] ?? $matchKey,
                    'pcatname' => $codes['pcatname'] !== '' ? $codes['pcatname'] : null,
                    'psubcatname' => $codes['psubcatname'] !== '' ? $codes['psubcatname'] : null,
                    'productgroupname' => $codes['productgroupname'] !== '' ? $codes['productgroupname'] : null,
                    'created_by' => auth()->check() ? auth()->id() : null,
                ]
            );
        }
    }

    /** @return array<string,array{pcatname:string,psubcatname:string,productgroupname:string}> */
    private function loadCategoryMapOverride(string $path): array
    {
        $overrides = [];
        foreach (self::readSimpleCsv($path) as $row) {
            $text = trim((string) ($row['woo_categories'] ?? ''));
            $key = self::normalizeName($text);
            if ($key === '') {
                continue;
            }
            $overrides[$key] = [
                'pcatname' => trim((string) ($row['pcatname'] ?? '')),
                'psubcatname' => trim((string) ($row['psubcatname'] ?? '')),
                'productgroupname' => trim((string) ($row['productgroupname'] ?? '')),
            ];
            $this->overrideRawText[$key] = $text;
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
