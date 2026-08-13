<?php

use App\Services\Lazada\LazadaCategoryMatcher;

test('tokenize lowercases, strips punctuation, and drops stopwords and short tokens', function () {
    expect(LazadaCategoryMatcher::tokenize('Socket Set 1/2" & 1/4" XI-ON'))
        ->toBe(['socket', 'set', 'xi', 'on']);

    expect(LazadaCategoryMatcher::tokenize('Ear Plugs'))->toBe(['ear', 'plugs']);

    expect(LazadaCategoryMatcher::tokenize('Tools and Equipment for the Garage'))
        ->toBe(['tools', 'equipment', 'garage']);
});

test('an exact name match scores highest among candidates', function () {
    $leafTokens = LazadaCategoryMatcher::tokenize('Pressure Washers');

    $candidates = [
        ['id' => 1, 'name' => 'Pressure Washers', 'path' => 'Outdoor > Pressure Washers', 'tokens' => LazadaCategoryMatcher::tokenize('Pressure Washers'), 'parentTokens' => []],
        ['id' => 2, 'name' => 'Electric Pressure Cookers', 'path' => 'Home > Electric Pressure Cookers', 'tokens' => LazadaCategoryMatcher::tokenize('Electric Pressure Cookers'), 'parentTokens' => []],
        ['id' => 3, 'name' => 'Blood Pressure Monitors', 'path' => 'Health > Blood Pressure Monitors', 'tokens' => LazadaCategoryMatcher::tokenize('Blood Pressure Monitors'), 'parentTokens' => []],
    ];

    $suggestions = LazadaCategoryMatcher::suggest($leafTokens, [], $candidates);

    expect($suggestions)->not->toBeEmpty();
    expect($suggestions[0]['id'])->toBe(1);
    // Leaf-name overlap is a perfect 1.0 Jaccard match; with no parent
    // context supplied on either side, only the 0.75 leaf weight applies.
    expect($suggestions[0]['score'])->toBe(75.0);
});

test('completely unrelated names score at or near zero and are excluded', function () {
    $leafTokens = LazadaCategoryMatcher::tokenize('Silicone Glue');

    $candidates = [
        ['id' => 1, 'name' => 'Fashion Accessories', 'path' => 'Fashion > Fashion Accessories', 'tokens' => LazadaCategoryMatcher::tokenize('Fashion Accessories'), 'parentTokens' => []],
    ];

    expect(LazadaCategoryMatcher::suggest($leafTokens, [], $candidates))->toBe([]);
});

test('parent path context breaks a tie between candidates with identical leaf-name overlap', function () {
    $leafTokens = LazadaCategoryMatcher::tokenize('Training Equipment');
    $parentTokens = LazadaCategoryMatcher::tokenize('Golf');

    $candidates = [
        [
            'id' => 1,
            'name' => 'Training Equipment',
            'path' => 'Sports > Golf > Training Equipment',
            'tokens' => LazadaCategoryMatcher::tokenize('Training Equipment'),
            'parentTokens' => LazadaCategoryMatcher::tokenize('Golf'),
        ],
        [
            'id' => 2,
            'name' => 'Training Equipment',
            'path' => 'Sports > Hockey > Training Equipment',
            'tokens' => LazadaCategoryMatcher::tokenize('Training Equipment'),
            'parentTokens' => LazadaCategoryMatcher::tokenize('Hockey'),
        ],
    ];

    $suggestions = LazadaCategoryMatcher::suggest($leafTokens, $parentTokens, $candidates);

    expect($suggestions[0]['id'])->toBe(1);
    expect($suggestions[0]['score'])->toBeGreaterThan($suggestions[1]['score']);
});

test('suggest returns at most the requested limit, sorted descending by score', function () {
    $leafTokens = LazadaCategoryMatcher::tokenize('Vacuum Cleaner');

    $candidates = [];
    for ($i = 1; $i <= 10; $i++) {
        $candidates[] = [
            'id' => $i,
            'name' => "Vacuum Cleaner Model {$i}",
            'path' => "Home > Vacuum Cleaner Model {$i}",
            'tokens' => LazadaCategoryMatcher::tokenize("Vacuum Cleaner Model {$i}"),
            'parentTokens' => [],
        ];
    }

    $suggestions = LazadaCategoryMatcher::suggest($leafTokens, [], $candidates, 3);

    expect($suggestions)->toHaveCount(3);
    expect($suggestions[0]['score'])->toBeGreaterThanOrEqual($suggestions[1]['score']);
    expect($suggestions[1]['score'])->toBeGreaterThanOrEqual($suggestions[2]['score']);
});
