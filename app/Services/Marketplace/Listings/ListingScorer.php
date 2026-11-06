<?php

namespace App\Services\Marketplace\Listings;

/**
 * Phase 3A scoring — how likely a PIM product is the product behind a
 * marketplace listing whose SKU isn't in PIM. Pure (no DB): inputs are the
 * pre-computed features of both sides; ListingScoreSuggester feeds it.
 *
 * Score = sum of the signals below, clamped to 0–100. Weights:
 *
 *   name     NAME_WEIGHT × MatchText::nameSimilarity() (Thai or English PIM
 *            name, whichever is closer; brands and promo noise stripped)
 *            → 0–60
 *   model    a shared model-number token (MatchText::modelTokens — "MG-6001",
 *            "LDM-40AX", a 5-digit SKU written in the title …):
 *            +MODEL_STRONG when the token is rare in PIM (≤ RARE_DF
 *            products), +MODEL_WEAK when it's shared by up to COMMON_DF,
 *            ignored above that; +MODEL_EXTRA per further shared token;
 *            capped at MODEL_CAP. The single strongest signal: two
 *            listings of "the same kind of thing" share many words, but
 *            rarely a model number.
 *   brand    the listing names a brand (BrandDictionary::detect) and the
 *            product's brand is the same → +BRAND_MATCH; same family
 *            (PUMPKIN vs PUMPKIN-PRO) → +BRAND_FAMILY; a clearly different
 *            brand → BRAND_MISMATCH (penalty). Unknown on either side → 0.
 *   price    within 10% → +PRICE_NEAR; more than 50% apart → PRICE_FAR.
 *            Deliberately weak: a listing price may be a pack/bundle price
 *            or a promo price.
 *   size     a unit both names state with no number in common ("40 เมตร"
 *            vs "70 เมตร", "29 pcs" vs "13 pcs") → MEASURE_CONFLICT.
 *   part     the PIM product is a spare part / packaging (SKU SP…, PK…)
 *            but the listing doesn't say อะไหล่/spare part → SPARE_PART —
 *            parts share their machine's name and model number.
 *   range    a model token that only appears inside a code range of the
 *            listing title ("… 23159-23166") counts as MODEL_WEAK, never
 *            strong: it names a sibling variant, not necessarily this one.
 *
 * Shown only when score ≥ MIN_SCORE AND (name similarity ≥ MIN_NAME or a
 * rare model token matched) — so neither a same-brand-same-price nor a
 * common-token coincidence alone produces a suggestion. Always confidence
 * 'low': never bulk-accepted, never auto-linked.
 */
class ListingScorer
{
    public const NAME_WEIGHT = 60;

    public const MODEL_STRONG = 35;

    public const MODEL_WEAK = 12;

    public const MODEL_EXTRA = 5;

    public const MODEL_CAP = 45;

    public const RARE_DF = 3;

    public const COMMON_DF = 20;

    public const BRAND_MATCH = 10;

    public const BRAND_FAMILY = 4;

    public const BRAND_MISMATCH = -20;

    public const PRICE_NEAR = 5;

    public const PRICE_FAR = -5;

    public const MEASURE_CONFLICT = -15;

    public const SPARE_PART = -25;

    public const MIN_SCORE = 40;

    public const MIN_NAME = 0.3;

    public function __construct(private readonly BrandDictionary $brands) {}

    /**
     * @param  array{trigrams: array<string, true>, tokens: array<string, string>, range?: array<string, true>, measures?: array<string, array<string, true>>, part?: bool, brand: ?string, price: ?float}  $listing
     * @param  array{sku: string, th: array<string, true>, en: array<string, true>, tokens: list<string>, measures?: array<string, array<string, true>>, brand: ?string, price: ?float}  $product
     * @param  array<string, int>  $tokenDf  model token key => number of PIM products carrying it
     * @return array{score: int, reasons: list<string>}|null null = below threshold
     */
    public function score(array $listing, array $product, array $tokenDf): ?array
    {
        $reasons = [];
        $score = 0.0;

        // name
        $nameSim = max(
            MatchText::nameSimilarity($listing['trigrams'], $product['th']),
            MatchText::nameSimilarity($listing['trigrams'], $product['en']),
        );
        $score += self::NAME_WEIGHT * $nameSim;
        if ($nameSim >= 0.2) {
            $reasons[] = 'ชื่อคล้าย '.(int) round($nameSim * 100).'%';
        }

        // model tokens
        $modelPoints = 0;
        $rareHit = false;
        $productTokens = array_flip($product['tokens']);
        foreach ($listing['tokens'] as $key => $original) {
            if (! isset($productTokens[$key])) {
                continue;
            }
            $df = $tokenDf[$key] ?? 1;
            if ($df > self::COMMON_DF) {
                continue;
            }
            $rare = $df <= self::RARE_DF && ! isset($listing['range'][$key]);
            $points = $modelPoints === 0 ? ($rare ? self::MODEL_STRONG : self::MODEL_WEAK) : self::MODEL_EXTRA;
            $modelPoints += $points;
            $rareHit = $rareHit || $rare;
            $reasons[] = $key === strtoupper(str_replace(['-', '.', '_'], '', $product['sku']))
                ? "SKU {$product['sku']} อยู่ในชื่อ listing"
                : (isset($listing['range'][$key])
                    ? "รหัส {$original} อยู่ในช่วงรหัสของ listing"
                    : "รหัสรุ่น {$original} ตรง".($rare ? '' : " (มี {$df} สินค้าใช้รหัสนี้)"));
        }
        $score += min($modelPoints, self::MODEL_CAP);

        // brand
        $lb = $listing['brand'];
        $pb = $product['brand'];
        if ($lb !== null && $pb !== null) {
            if ($lb === $pb) {
                $score += self::BRAND_MATCH;
                $reasons[] = 'แบรนด์ '.$this->brands->label($lb).' ตรง';
            } elseif ($this->brands->family($lb) !== null && $this->brands->family($lb) === $this->brands->family($pb)) {
                $score += self::BRAND_FAMILY;
                $reasons[] = 'แบรนด์กลุ่มเดียวกัน ('.$this->brands->label($lb).' / '.$this->brands->label($pb).')';
            } else {
                $score += self::BRAND_MISMATCH;
                $reasons[] = 'แบรนด์ไม่ตรง (listing: '.$this->brands->label($lb).' / PIM: '.$this->brands->label($pb).')';
            }
        }

        // price
        $lp = $listing['price'];
        $pp = $product['price'];
        if ($lp !== null && $pp !== null && $lp > 0 && $pp > 0) {
            $diff = abs($lp - $pp) / $pp;
            if ($diff <= 0.10) {
                $score += self::PRICE_NEAR;
                $reasons[] = 'ราคาใกล้เคียง';
            } elseif ($diff > 0.50) {
                $score += self::PRICE_FAR;
                $reasons[] = 'ราคาต่างกันมาก (฿'.number_format($lp, 0).' / ฿'.number_format($pp, 0).')';
            }
        }

        // size / spec
        $conflicts = MatchText::measureConflicts($listing['measures'] ?? [], $product['measures'] ?? []);
        if ($conflicts !== []) {
            $score += self::MEASURE_CONFLICT;
            $reasons[] = 'ขนาด/สเปกต่างกัน ('.$conflicts[0].')';
        }

        // spare part / packaging offered for a listing that isn't one
        if (self::isPartSku($product['sku']) && ! ($listing['part'] ?? false)) {
            $score += self::SPARE_PART;
            $reasons[] = 'สินค้าใน PIM เป็นอะไหล่/ส่วนประกอบ';
        }

        $final = (int) max(0, min(100, round($score)));
        if ($final < self::MIN_SCORE || ($nameSim < self::MIN_NAME && ! $rareHit)) {
            return null;
        }

        return ['score' => $final, 'reasons' => $reasons];
    }

    /** spare part (SP12345-…) or packaging/part-kit (PK3-…) SKUs */
    public static function isPartSku(string $sku): bool
    {
        return (bool) preg_match('/^(SP|PK)\d/i', $sku);
    }

    /** the listing itself sells a spare part */
    public static function isPartListing(?string $name, ?string $sellerSku): bool
    {
        return (bool) preg_match('/อะไหล่|spare|\bparts?\b/iu', (string) $name)
            || (bool) preg_match('/^SP-?\d/i', trim((string) $sellerSku));
    }
}
