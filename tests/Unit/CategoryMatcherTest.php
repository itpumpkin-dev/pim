<?php

use App\Services\CategoryMatcher;

test('tokenize lowercases, strips punctuation, and drops stopwords and short tokens', function () {
    expect(CategoryMatcher::tokenize('Socket Set 1/2" & 1/4" XI-ON'))
        ->toBe(['socket', 'set', 'xi', 'on']);

    expect(CategoryMatcher::tokenize('Ear Plugs'))->toBe(['ear', 'plugs']);

    expect(CategoryMatcher::tokenize('Tools and Equipment for the Garage'))
        ->toBe(['tools', 'equipment', 'garage']);
});

test('an exact name match scores highest among candidates', function () {
    $leafTokens = CategoryMatcher::tokenize('Pressure Washers');

    $candidates = [
        ['id' => 1, 'name' => 'Pressure Washers', 'path' => 'Outdoor > Pressure Washers', 'tokens' => CategoryMatcher::tokenize('Pressure Washers'), 'parentTokens' => []],
        ['id' => 2, 'name' => 'Electric Pressure Cookers', 'path' => 'Home > Electric Pressure Cookers', 'tokens' => CategoryMatcher::tokenize('Electric Pressure Cookers'), 'parentTokens' => []],
        ['id' => 3, 'name' => 'Blood Pressure Monitors', 'path' => 'Health > Blood Pressure Monitors', 'tokens' => CategoryMatcher::tokenize('Blood Pressure Monitors'), 'parentTokens' => []],
    ];

    $suggestions = CategoryMatcher::suggest($leafTokens, [], $candidates);

    expect($suggestions)->not->toBeEmpty();
    expect($suggestions[0]['id'])->toBe(1);
    // Leaf-name overlap is a perfect 1.0 Jaccard match; with no parent
    // context supplied on either side, only the 0.75 leaf weight applies.
    expect($suggestions[0]['score'])->toBe(75.0);
});

test('completely unrelated names score at or near zero and are excluded', function () {
    $leafTokens = CategoryMatcher::tokenize('Silicone Glue');

    $candidates = [
        ['id' => 1, 'name' => 'Fashion Accessories', 'path' => 'Fashion > Fashion Accessories', 'tokens' => CategoryMatcher::tokenize('Fashion Accessories'), 'parentTokens' => []],
    ];

    expect(CategoryMatcher::suggest($leafTokens, [], $candidates))->toBe([]);
});

test('parent path context breaks a tie between candidates with identical leaf-name overlap', function () {
    $leafTokens = CategoryMatcher::tokenize('Training Equipment');
    $parentTokens = CategoryMatcher::tokenize('Golf');

    $candidates = [
        [
            'id' => 1,
            'name' => 'Training Equipment',
            'path' => 'Sports > Golf > Training Equipment',
            'tokens' => CategoryMatcher::tokenize('Training Equipment'),
            'parentTokens' => CategoryMatcher::tokenize('Golf'),
        ],
        [
            'id' => 2,
            'name' => 'Training Equipment',
            'path' => 'Sports > Hockey > Training Equipment',
            'tokens' => CategoryMatcher::tokenize('Training Equipment'),
            'parentTokens' => CategoryMatcher::tokenize('Hockey'),
        ],
    ];

    $suggestions = CategoryMatcher::suggest($leafTokens, $parentTokens, $candidates);

    expect($suggestions[0]['id'])->toBe(1);
    expect($suggestions[0]['score'])->toBeGreaterThan($suggestions[1]['score']);
});

test('suggest returns at most the requested limit, sorted descending by score', function () {
    $leafTokens = CategoryMatcher::tokenize('Vacuum Cleaner');

    $candidates = [];
    for ($i = 1; $i <= 10; $i++) {
        $candidates[] = [
            'id' => $i,
            'name' => "Vacuum Cleaner Model {$i}",
            'path' => "Home > Vacuum Cleaner Model {$i}",
            'tokens' => CategoryMatcher::tokenize("Vacuum Cleaner Model {$i}"),
            'parentTokens' => [],
        ];
    }

    $suggestions = CategoryMatcher::suggest($leafTokens, [], $candidates, 3);

    expect($suggestions)->toHaveCount(3);
    expect($suggestions[0]['score'])->toBeGreaterThanOrEqual($suggestions[1]['score']);
    expect($suggestions[1]['score'])->toBeGreaterThanOrEqual($suggestions[2]['score']);
});
