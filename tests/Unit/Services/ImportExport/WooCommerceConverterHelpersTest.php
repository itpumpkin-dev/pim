<?php

use App\Services\ImportExport\WooCommerceConverter;

/**
 * Invokes a private static method on WooCommerceConverter via reflection.
 * Uses invokeArgs() (not invoke(...$args)) so a by-reference argument
 * (mapType()'s $warnings) is actually forwarded — spreading an array with
 * `...` always passes by value, even when an element is itself a reference.
 */
function invokeConverter(string $method, array $args = []): mixed
{
    $ref = new ReflectionMethod(WooCommerceConverter::class, $method);

    return $ref->invokeArgs(null, $args);
}

// --- stripBom ---

test('stripBom removes a leading UTF-8 BOM but leaves other content untouched', function () {
    expect(invokeConverter('stripBom', ["\xEF\xBB\xBFSKU"]))->toBe('SKU');
    expect(invokeConverter('stripBom', ['SKU']))->toBe('SKU');
});

// --- normalizeName ---

test('normalizeName trims, collapses whitespace, and lowercases', function () {
    expect(invokeConverter('normalizeName', ["  Power   Tools  "]))->toBe('power tools');
});

// --- stripHtmlToText ---

test('stripHtmlToText converts list/paragraph/heading tags into newlines and strips the rest', function () {
    $html = '<p>Intro</p><ul><li>One</li><li>Two</li></ul>';
    expect(invokeConverter('stripHtmlToText', [$html]))->toBe("Intro\nOne\nTwo");
});

test('stripHtmlToText converts table rows/headings into newlines and cells into spaces', function () {
    // Only the opening <tr> matches the "block" tag regex (no closing-slash
    // variant in that pattern) and becomes a newline; both <td> and </td>
    // match the separate td/th regex and each become a single space; the
    // leftover unconverted </tr>/<table>/</table> tags are simply dropped
    // by the final strip_tags() with no whitespace inserted for them.
    $html = '<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>';
    expect(invokeConverter('stripHtmlToText', [$html]))->toBe("A B \n C");
});

test('stripHtmlToText decodes HTML entities', function () {
    expect(invokeConverter('stripHtmlToText', ['Fish &amp; Chips &mdash; 10&quot;']))->toBe('Fish & Chips — 10"');
});

test('stripHtmlToText collapses repeated blank lines down to one', function () {
    $html = '<p>A</p><p></p><p>B</p>';
    expect(invokeConverter('stripHtmlToText', [$html]))->toBe("A\nB");
});

// --- pickDescription ---

test('pickDescription prefers the full description when it has real text, stripped', function () {
    $result = invokeConverter('pickDescription', ['<p>Full text</p>', 'Short text', true]);
    expect($result)->toBe('Full text');
});

test('pickDescription falls back to the short description when the full one strips to nothing (e.g. just an image banner)', function () {
    $result = invokeConverter('pickDescription', ['<img src="banner.jpg">', 'Short bullet points', true]);
    expect($result)->toBe('Short bullet points');
});

test('pickDescription with stripHtml=false returns raw HTML, still preferring full over short by stripped-emptiness', function () {
    $result = invokeConverter('pickDescription', ['<img src="banner.jpg">', '<p>Short</p>', false]);
    expect($result)->toBe('<p>Short</p>');
});

// --- mapMetaField ---

test('mapMetaField strips HTML when requested and passes through raw otherwise', function () {
    expect(invokeConverter('mapMetaField', ['<p>Spec</p>', true]))->toBe('Spec');
    expect(invokeConverter('mapMetaField', ['<p>Spec</p>', false]))->toBe('<p>Spec</p>');
});

// --- firstImageUrl ---

test('firstImageUrl takes the first of a comma-separated list, trimmed', function () {
    expect(invokeConverter('firstImageUrl', ['https://a.jpg, https://b.jpg']))->toBe('https://a.jpg');
});

test('firstImageUrl on an empty cell returns an empty string', function () {
    expect(invokeConverter('firstImageUrl', ['']))->toBe('');
});

// --- resolvePowerType ---

test('resolvePowerType matches the corded/cordless attribute column by name and maps its value', function () {
    $row = ['Attribute 1 name' => 'ใช้สาย/ไร้สาย', 'Attribute 1 value(s)' => 'ใช้สาย'];
    expect(invokeConverter('resolvePowerType', [$row, ['Attribute 1 name']]))->toBe('corded');

    $row2 = ['Attribute 1 name' => 'ใช้สาย/ไร้สาย', 'Attribute 1 value(s)' => 'cordless'];
    expect(invokeConverter('resolvePowerType', [$row2, ['Attribute 1 name']]))->toBe('cordless');
});

test('resolvePowerType ignores an "Attribute N name" column that is not the corded/cordless one', function () {
    $row = ['Attribute 1 name' => 'product-feature', 'Attribute 1 value(s)' => 'Recommended'];
    expect(invokeConverter('resolvePowerType', [$row, ['Attribute 1 name']]))->toBe('');
});

test('resolvePowerType returns empty when the value does not match a known power-type word', function () {
    $row = ['Attribute 1 name' => 'ใช้สาย/ไร้สาย', 'Attribute 1 value(s)' => 'something else'];
    expect(invokeConverter('resolvePowerType', [$row, ['Attribute 1 name']]))->toBe('');
});

test('resolvePowerType checks every "Attribute N name" column present, not just the first', function () {
    $row = [
        'Attribute 1 name' => 'product-feature', 'Attribute 1 value(s)' => 'Recommended',
        'Attribute 2 name' => 'ใช้สาย/ไร้สาย', 'Attribute 2 value(s)' => 'ไร้สาย',
    ];
    expect(invokeConverter('resolvePowerType', [$row, ['Attribute 1 name', 'Attribute 2 name']]))->toBe('cordless');
});

// --- mapType ---

test('mapType passes simple/configurable through unchanged, case-insensitively, with no warning', function () {
    $warnings = [];
    expect(invokeConverter('mapType', ['Simple', 'SKU-1', &$warnings]))->toBe('simple');
    expect($warnings)->toBe([]);

    $warnings = [];
    expect(invokeConverter('mapType', ['CONFIGURABLE', 'SKU-1', &$warnings]))->toBe('configurable');
    expect($warnings)->toBe([]);
});

test('mapType coerces an empty type to simple silently (no warning)', function () {
    $warnings = [];
    expect(invokeConverter('mapType', ['', 'SKU-1', &$warnings]))->toBe('simple');
    expect($warnings)->toBe([]);
});

test('mapType coerces an unsupported type to simple and records a warning naming the SKU', function () {
    $warnings = [];
    expect(invokeConverter('mapType', ['variable', 'SKU-1', &$warnings]))->toBe('simple');
    expect($warnings)->toHaveCount(1);
    expect($warnings[0])->toContain('SKU-1')->toContain('variable');
});

// --- mapEnabled ---

test('mapEnabled maps exactly "1" to enabled, everything else to disabled', function () {
    expect(invokeConverter('mapEnabled', ['1']))->toBe('1');
    expect(invokeConverter('mapEnabled', ['0']))->toBe('0');
    expect(invokeConverter('mapEnabled', ['']))->toBe('0');
    expect(invokeConverter('mapEnabled', ['true']))->toBe('0');
});

// --- detectEol ---

test('detectEol matches the whole word EOL, case-insensitively, in any of the given fields', function () {
    expect(invokeConverter('detectEol', ['Discontinued - EOL', '']))->toBe('1');
    expect(invokeConverter('detectEol', ['', 'this product is eol now']))->toBe('1');
});

test('detectEol does not match EOL as a substring of another word', function () {
    expect(invokeConverter('detectEol', ['A cool product', '']))->toBe('');
});

test('detectEol returns empty when none of the fields mention it', function () {
    expect(invokeConverter('detectEol', ['Great product', 'Still in stock']))->toBe('');
});

// --- matchCategoryCell ---

test('matchCategoryCell on an empty cell matches trivially with all-empty codes', function () {
    [$codes, $matched] = invokeConverter('matchCategoryCell', ['', [], [], [], []]);
    expect($matched)->toBeTrue();
    expect($codes)->toBe(['pcatname' => '', 'psubcatname' => '', 'productgroupname' => '']);
});

test('matchCategoryCell prefers an explicit override over any master lookup', function () {
    $overrides = ['tools' => ['pcatname' => 'x', 'psubcatname' => 'x1', 'productgroupname' => 'x1001']];
    [$codes, $matched] = invokeConverter('matchCategoryCell', ['Tools', ['tools' => 'wrong'], [], [], $overrides]);
    expect($matched)->toBeTrue();
    expect($codes)->toBe(['pcatname' => 'x', 'psubcatname' => 'x1', 'productgroupname' => 'x1001']);
});

test('matchCategoryCell walks a "Root > Sub > Group" path from the deepest level up, matching the first level that resolves', function () {
    $groups = ['power tools' => 'a025001'];
    [$codes, $matched] = invokeConverter('matchCategoryCell', ['Tools > Power Tools', [], [], $groups, []]);
    expect($matched)->toBeTrue();
    expect($codes)->toBe(['pcatname' => 'a', 'psubcatname' => 'a025', 'productgroupname' => 'a025001']);
});

test('matchCategoryCell falls back to a subcategory match when no group matches', function () {
    $subcategories = ['power tools' => 'a025'];
    [$codes, $matched] = invokeConverter('matchCategoryCell', ['Tools > Power Tools', [], $subcategories, [], []]);
    expect($matched)->toBeTrue();
    expect($codes)->toBe(['pcatname' => 'a', 'psubcatname' => 'a025', 'productgroupname' => '']);
});

test('matchCategoryCell falls back to a category-level match when neither group nor subcategory matches', function () {
    $categories = ['tools' => 'a'];
    [$codes, $matched] = invokeConverter('matchCategoryCell', ['Tools > Power Tools', $categories, [], [], []]);
    expect($matched)->toBeTrue();
    expect($codes)->toBe(['pcatname' => 'a', 'psubcatname' => '', 'productgroupname' => '']);
});

test('matchCategoryCell tries every comma-separated path independently and matches on the first one that resolves', function () {
    $categories = ['garden' => 'b'];
    [$codes, $matched] = invokeConverter('matchCategoryCell', ['Nonexistent Path, Garden', $categories, [], [], []]);
    expect($matched)->toBeTrue();
    expect($codes)->toBe(['pcatname' => 'b', 'psubcatname' => '', 'productgroupname' => '']);
});

test('matchCategoryCell reports unmatched with empty codes when nothing resolves at all', function () {
    [$codes, $matched] = invokeConverter('matchCategoryCell', ['Totally Unknown Category', [], [], [], []]);
    expect($matched)->toBeFalse();
    expect($codes)->toBe(['pcatname' => '', 'psubcatname' => '', 'productgroupname' => '']);
});
