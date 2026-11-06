<?php

use App\Models\Attribute;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Marketplace\Listings\ListingMatchSuggester;
use Illuminate\Support\Facades\DB;

/**
 * Product Matching phase 2 — ListingMatchSuggester rules (a–f) + negatives.
 */
function lmsSuggest(array $skus): array
{
    return app(ListingMatchSuggester::class)->suggest($skus);
}

function lmsTop(string $sku): ?array
{
    return lmsSuggest([1 => $sku])[1][0] ?? null;
}

test('a: case/whitespace-normalised equal', function () {
    $p = Product::create(['sku' => 'LMS-Ab 01']);

    $top = lmsTop('lms-ab01');

    expect($top['type'])->toBe('normalized')
        ->and($top['confidence'])->toBe('high')
        ->and($top['items'])->toBe([['product_id' => $p->id, 'sku' => 'LMS-Ab 01', 'quantity' => 1]])
        ->and($top['pack_quantity'])->toBeNull();
});

test('b: trailing punctuation is stripped', function () {
    $p = Product::create(['sku' => 'LMS50374']);

    foreach (['LMS50374.', 'LMS50374-', 'LMS50374_', 'LMS50374..'] as $sku) {
        $top = lmsTop($sku);
        expect($top['type'])->toBe('trimmed')->and($top['items'][0]['product_id'])->toBe($p->id)->and($top['confidence'])->toBe('high');
    }
});

test('c: a known prefix is stripped only when the rest is a PIM SKU', function () {
    $p = Product::create(['sku' => 'LMS31345']);

    expect(lmsTop('TX-LMS31345'))->toMatchArray(['type' => 'prefix', 'confidence' => 'high'])
        ->and(lmsTop('sp-LMS31345')['items'][0]['product_id'])->toBe($p->id)
        ->and(lmsTop('P-LMS31345')['type'])->toBe('prefix')
        ->and(lmsTop('TX-LMS-NOPE'))->toBeNull()
        ->and(lmsTop('ZZ-LMS31345'))->toBeNull();
});

test('d: pack suffix _N where the base exists → pack_quantity N; base missing → nothing', function () {
    $p = Product::create(['sku' => 'LMS15123']);

    $top = lmsTop('LMS15123_5');
    expect($top)->toMatchArray(['type' => 'pack', 'confidence' => 'high', 'pack_quantity' => 5])
        ->and($top['items'][0]['product_id'])->toBe($p->id);

    expect(lmsTop('LMS99999_5'))->toBeNull()          // base not in PIM
        ->and(lmsTop('LMS15123_1234'))->toBeNull();   // 4 digits is not a pack size

    // pack after a prefix strip
    expect(lmsTop('TX-LMS15123_10'))->toMatchArray(['type' => 'pack', 'pack_quantity' => 10]);
});

test('d: dash pack suffix is only a medium suggestion', function () {
    Product::create(['sku' => 'MG-6001']);

    $top = lmsTop('MG-6001-10');

    expect($top)->toMatchArray(['type' => 'pack', 'confidence' => 'medium', 'pack_quantity' => 10]);
});

test('e: bundle A+B where every part exists; A*2 / Ax2 → qty 2; a missing part → nothing', function () {
    $a = Product::create(['sku' => 'LMSB1']);
    $b = Product::create(['sku' => 'LMSB2']);
    Product::create(['sku' => 'LMSB3']);

    $top = lmsTop('LMSB1+LMSB2');
    expect($top['type'])->toBe('bundle')
        ->and($top['confidence'])->toBe('medium')
        ->and($top['items'])->toBe([
            ['product_id' => $a->id, 'sku' => 'LMSB1', 'quantity' => 1],
            ['product_id' => $b->id, 'sku' => 'LMSB2', 'quantity' => 1],
        ]);

    expect(lmsTop('LMSB1*2+LMSB2')['items'][0]['quantity'])->toBe(2)
        ->and(lmsTop('LMSB1 + LMSB2x3 + LMSB3')['items'][1]['quantity'])->toBe(3)
        ->and(lmsTop('LMSB1+LMS-MISSING'))->toBeNull();
});

test('e: A+A collapses into a medium pack of one product', function () {
    $a = Product::create(['sku' => 'LMSC1']);

    $top = lmsTop('LMSC1+LMSC1');

    expect($top)->toMatchArray(['type' => 'pack', 'pack_quantity' => 2, 'confidence' => 'medium'])
        ->and($top['items'])->toBe([['product_id' => $a->id, 'sku' => 'LMSC1', 'quantity' => 1]]);
});

test('f: an 8–14 digit SKU matches the barcode_pcs attribute (medium), box/carton barcodes are low', function () {
    $pcs = Attribute::firstOrCreate(['code' => 'barcode_pcs'], ['type' => 'text']);
    $box = Attribute::firstOrCreate(['code' => 'barcode_box'], ['type' => 'text']);
    $p = Product::create(['sku' => 'LMS-BC']);
    $q = Product::create(['sku' => 'LMS-BC2']);
    ProductValue::create(['product_id' => $p->id, 'attribute_id' => $pcs->id, 'value' => ' 8850000111222 ']);
    ProductValue::create(['product_id' => $q->id, 'attribute_id' => $box->id, 'value' => '8850000333444']);

    $top = lmsTop('8850000111222');
    expect($top)->toMatchArray(['type' => 'barcode', 'confidence' => 'medium'])
        ->and($top['items'][0]['product_id'])->toBe($p->id);

    expect(lmsTop('8850000333444'))->toMatchArray(['type' => 'barcode', 'confidence' => 'low']);
    expect(lmsTop('8850000999999'))->toBeNull();   // no product has it
    expect(lmsTop('1234567'))->toBeNull();          // 7 digits is not a barcode
});

test('an ambiguous key (several products normalise the same) is skipped unless one is verbatim', function () {
    Product::create(['sku' => 'LMS-AMB']);
    Product::create(['sku' => 'lms-amb']);

    expect(lmsTop('LMS-amb'))->toBeNull();

    // the verbatim one wins for a derived candidate
    $top = lmsTop('LMS-AMB.');
    expect($top['type'])->toBe('trimmed')->and($top['items'][0]['sku'])->toBe('LMS-AMB');
});

test('suggestions are ranked by rule and de-duplicated; listings with none are omitted; batched queries', function () {
    Product::create(['sku' => 'LMSR1']);
    Product::create(['sku' => 'LMSR2']);

    DB::enableQueryLog();
    $result = lmsSuggest([
        10 => 'LMSR1.',
        11 => 'NOTHING-HERE',
        12 => null,
        13 => 'LMSR1+LMSR2',
        14 => 'LMSR2_3',
    ]);
    $queries = count(DB::getQueryLog());
    DB::disableQueryLog();

    expect(array_keys($result))->toBe([10, 13, 14])
        ->and($result[10])->toHaveCount(1)
        ->and($result[13][0]['type'])->toBe('bundle')
        ->and($result[14][0]['type'])->toBe('pack');
    expect($queries)->toBeLessThanOrEqual(3);
});
