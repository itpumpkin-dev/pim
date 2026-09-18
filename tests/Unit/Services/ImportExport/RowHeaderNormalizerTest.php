<?php

use App\Services\ImportExport\RowHeaderNormalizer;

$columnLabels = [
    'pname' => 'Product Name',
    'sku' => 'SKU',
    'pbrand' => 'Brand',
];

test('rewrites a localized header label back to its raw code', function () use ($columnLabels) {
    $row = ['Product Name' => 'Widget', 'SKU' => 'W-1', 'Brand' => 'Acme'];

    expect(RowHeaderNormalizer::normalize($row, $columnLabels))->toBe([
        'pname' => 'Widget',
        'sku' => 'W-1',
        'pbrand' => 'Acme',
    ]);
});

test('matches labels case- and whitespace-insensitively', function () use ($columnLabels) {
    $row = ['  product name  ' => 'Widget', 'sku' => 'W-1', 'BRAND' => 'Acme'];

    expect(RowHeaderNormalizer::normalize($row, $columnLabels))->toBe([
        'pname' => 'Widget',
        'sku' => 'W-1',
        'pbrand' => 'Acme',
    ]);
});

test('a key that is already a raw code passes through unchanged even if it also happens to be a label text', function () use ($columnLabels) {
    // 'sku' is a valid code in $columnLabels, so it must win over any
    // label-based lookup, even though it's also the (lowercased) label text.
    $row = ['sku' => 'W-1'];

    expect(RowHeaderNormalizer::normalize($row, $columnLabels))->toBe(['sku' => 'W-1']);
});

test('an unrecognized key that matches neither a code nor a label passes through unchanged', function () use ($columnLabels) {
    $row = ['Product Name' => 'Widget', 'unknown_column' => 'mystery'];

    expect(RowHeaderNormalizer::normalize($row, $columnLabels))->toBe([
        'pname' => 'Widget',
        'unknown_column' => 'mystery',
    ]);
});

test('preserves non-string values untouched', function () use ($columnLabels) {
    $row = ['SKU' => null, 'Product Name' => 123, 'Brand' => ['nested' => true]];

    expect(RowHeaderNormalizer::normalize($row, $columnLabels))->toBe([
        'sku' => null,
        'pname' => 123,
        'pbrand' => ['nested' => true],
    ]);
});

test('an empty row normalizes to an empty array', function () use ($columnLabels) {
    expect(RowHeaderNormalizer::normalize([], $columnLabels))->toBe([]);
});

test('with no column labels at all, every key passes through unchanged', function () {
    $row = ['Product Name' => 'Widget', 'sku' => 'W-1'];

    expect(RowHeaderNormalizer::normalize($row, []))->toBe($row);
});

test('two labels that normalize to the same key: the later column code wins', function () {
    // Deliberately pathological input — two distinct codes whose labels
    // collide once lowercased/trimmed. Documents the actual (last-write-wins)
    // behavior of the label->code map build, rather than leaving it undefined.
    $columnLabels = ['a' => 'Name', 'b' => '  name  '];

    expect(RowHeaderNormalizer::normalize(['NAME' => 'x'], $columnLabels))->toBe(['b' => 'x']);
});
