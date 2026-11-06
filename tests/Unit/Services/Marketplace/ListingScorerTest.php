<?php

use App\Services\Marketplace\Listings\BrandDictionary;
use App\Services\Marketplace\Listings\ListingScorer;
use App\Services\Marketplace\Listings\MatchText;

/**
 * Product Matching phase 3A — pure scoring (no DB): name normalisation,
 * model tokens, brand detection and the ListingScorer weights/threshold.
 */
function lsBrands(): BrandDictionary
{
    return new BrandDictionary([
        'pumpkin' => ['label' => 'PUMPKIN'],
        'pumpkin_pro' => ['label' => 'PUMPKIN-PRO'],
        'netto' => ['label' => 'NETTO'],
        'je_tech' => ['label' => 'JE TECH'],
    ]);
}

function lsListing(string $name, ?float $price = null, ?string $sku = null): array
{
    $brands = lsBrands();
    $norm = MatchText::normalizeName($name, $brands->aliases());

    return [
        'trigrams' => MatchText::trigrams($norm),
        'tokens' => MatchText::modelTokens($name.' '.$sku),
        'range' => MatchText::rangeTokens($name),
        'measures' => MatchText::measures($norm),
        'part' => ListingScorer::isPartListing($name, $sku),
        'brand' => $brands->detect($name),
        'price' => $price,
    ];
}

function lsProduct(string $sku, string $name, ?string $brand = null, ?float $price = null): array
{
    $brands = lsBrands();
    $norm = MatchText::normalizeName($name, $brands->aliases());

    return [
        'sku' => $sku,
        'th' => MatchText::trigrams($norm),
        'en' => [],
        'tokens' => array_keys(MatchText::modelTokens($name.' '.$sku)),
        'measures' => MatchText::measures($norm),
        'brand' => $brand ?? $brands->detect($name),
        'price' => $price,
    ];
}

test('normalizeName strips promo brackets, noise phrases, emoji and brand words', function () {
    $norm = MatchText::normalizeName('【ส่งฟรี】 PUMPKIN 🔥 ของแท้ สว่านไฟฟ้า [ลด 50%] (Made in Germany) J-Series', lsBrands()->aliases());

    expect($norm)->toBe('สว่านไฟฟ้า made in germany j series');
});

test('model tokens keep codes, drop units / short numbers, split code ranges', function () {
    $tokens = MatchText::modelTokens('PUMPKIN PTT-G1211iS 1100W 40mm (ใหม่2026) /44393 LDM-40AX 23159-23166 SK-5');

    expect(array_keys($tokens))->toEqualCanonicalizing(['PTTG1211IS', '44393', 'LDM40AX', '23159', '23166'])
        ->and($tokens['LDM40AX'])->toBe('LDM-40AX');
});

test('brand detection prefers the longest alias at the earliest position', function () {
    $brands = lsBrands();

    expect($brands->detect('PUMPKIN PRO แผ่นตัด'))->toBe('pumpkin_pro')
        ->and($brands->detect('พัมคิน เลื่อยลันดา'))->toBe('pumpkin')
        ->and($brands->detect('Je-Tech ประแจ'))->toBe('je_tech')
        ->and($brands->detect('ประแจไม่มีแบรนด์'))->toBeNull()
        ->and($brands->family('pumpkin_pro'))->toBe('pumpkin');
});

test('a shared rare model number beats generic name similarity', function () {
    $listing = lsListing('PUMPKIN เครื่องวัดระยะเลเซอร์ ระยะไกล LDM-40AX พกพาสะดวก');
    $right = lsProduct('28363', 'PUMPKIN เครื่องวัดระยะเลเซอร์ LDM-40AX');
    $generic = lsProduct('11127', 'PUMPKIN เครื่องวัดระยะเลเซอร์ พกพาสะดวก ระยะไกล LDM-60');
    $df = ['LDM40AX' => 1, 'LDM60' => 1];
    $scorer = new ListingScorer(lsBrands());

    $a = $scorer->score($listing, $right, $df);
    $b = $scorer->score($listing, $generic, $df);

    expect($a)->not->toBeNull()
        ->and($a['score'])->toBeGreaterThan($b['score'] ?? 0)
        ->and($a['reasons'])->toContain('รหัสรุ่น LDM-40AX ตรง')
        ->and($a['reasons'])->toContain('แบรนด์ PUMPKIN ตรง');
});

test('a clearly different brand is penalised, the same family is not', function () {
    $scorer = new ListingScorer(lsBrands());
    $listing = lsListing('NETTO ค้อนช่างทอง ด้ามไม้ 200 กรัม');
    $same = $scorer->score($listing, lsProduct('1', 'NETTO ค้อนช่างทอง ด้ามไม้ 200 กรัม'), []);
    $other = $scorer->score($listing, lsProduct('2', 'PUMPKIN ค้อนช่างทอง ด้ามไม้ 200 กรัม'), []);

    expect($same['score'])->toBeGreaterThan(($other['score'] ?? 0) + 25);
    if ($other !== null) {
        expect(implode(' ', $other['reasons']))->toContain('แบรนด์ไม่ตรง');
    }

    $family = $scorer->score(lsListing('PUMPKIN PRO ใบตัดเหล็ก 4 นิ้ว'), lsProduct('3', 'ใบตัดเหล็ก 4 นิ้ว', 'pumpkin'), []);
    expect(implode(' ', $family['reasons']))->toContain('แบรนด์กลุ่มเดียวกัน');
});

test('price proximity is a weak bonus, size conflicts and spare parts are penalised', function () {
    $scorer = new ListingScorer(lsBrands());
    $listing = lsListing('PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร', 1000);

    $near = $scorer->score($listing, lsProduct('1', 'PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร', null, 1050), []);
    $noPrice = $scorer->score($listing, lsProduct('1', 'PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร'), []);
    expect($near['score'] - $noPrice['score'])->toBe(ListingScorer::PRICE_NEAR)
        ->and($near['reasons'])->toContain('ราคาใกล้เคียง');

    $otherSize = $scorer->score($listing, lsProduct('2', 'PUMPKIN เครื่องวัดระยะเลเซอร์ 70 เมตร'), []);
    expect($otherSize['score'] ?? 0)->toBeLessThan($noPrice['score'] + ListingScorer::MEASURE_CONFLICT + 1);

    $part = $scorer->score($listing, lsProduct('SP28363-01', 'PUMPKIN เครื่องวัดระยะเลเซอร์ 40 เมตร'), []);
    expect($part['score'] ?? 0)->toBeLessThan($noPrice['score']);
});

test('below the threshold nothing is suggested', function () {
    $scorer = new ListingScorer(lsBrands());

    // same brand + same price but unrelated product
    expect($scorer->score(lsListing('PUMPKIN กรรไกรตัดกิ่ง', 230), lsProduct('1', 'PUMPKIN เครื่องปั่นไฟดีเซล', null, 230), []))->toBeNull();
    // a model token shared by many products alone isn't enough
    expect($scorer->score(lsListing('ARCA ข้อต่อ 41001'), lsProduct('2', 'บ๊อกหัวเทียน 41001'), ['41001' => 15]))->toBeNull();
});
