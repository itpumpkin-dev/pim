<?php

namespace App\Services\Marketplace\Listings;

/**
 * Pure text helpers for the score-based matcher (phase 3A) — the SAME
 * functions normalise PIM product names (ProductMatchIndexBuilder) and
 * marketplace listing names (ListingScoreSuggester), so both sides compare
 * like with like. No DB access; unit-tested directly.
 */
class MatchText
{
    /**
     * Platform noise removed from listing names before comparing — promo
     * words that say nothing about WHICH product it is. Lower-case.
     */
    public const NOISE_PHRASES = [
        'ส่งฟรี', 'ฟรีค่าส่ง', 'ของแท้100%', 'ของแท้ 100%', 'แท้100%', 'แท้ 100%', 'ของแท้', 'พร้อมส่ง', 'ส่งไว', 'ส่งด่วน',
        'ราคาถูก', 'ถูกที่สุด', 'ราคาส่ง', 'ขายดี', 'สินค้าขายดี', 'มาใหม่', 'ใหม่ล่าสุด', 'สินค้าใหม่', 'ลดราคา', 'โปรโมชั่น',
        'รับประกันศูนย์', 'มีรับประกัน', 'รับประกัน', 'ประกันศูนย์', 'เก็บเงินปลายทาง', 'ของแถม', 'มีของแถม',
        'flash sale', 'free shipping', 'best seller', 'hot sale', 'official store', 'official', 'original', 'ready stock', 'sale',
    ];

    /** Bracketed segments containing one of these are dropped entirely (otherwise only the brackets go). */
    private const NOISE_BRACKET_HINTS = ['ส่ง', 'แท้', 'ใหม่', 'แถม', 'ลด', 'โปร', 'sale', 'promo', 'free', 'new', '%', 'ประกัน', 'ด่วน', 'ฟรี'];

    /** "40mm", "1100W", "18V", "4.5kg"… — numbers with a unit are not model numbers. */
    private const UNIT_TOKEN = '/^\d+(?:[.,]\d+)?(?:MM|CM|M|W|KW|V|VAC|VDC|ML|L|KG|G|A|AH|MAH|PSI|LM|RPM|NM|HP|IN|INCH|FT|PCS|PC|BAR|DB|HZ|MPA|CC|OZ|LB|T|X|K|P|PCS|ชิ้น|นิ้ว|มม|ซม|เมตร|ลิตร|กรัม|วัตต์|หุน)$/u';

    /**
     * Lower-cased, noise-free, brand-free text for trigram comparison.
     *
     * @param  list<string>  $brandAliases  normalised aliases (BrandDictionary::aliases()) stripped as whole words
     */
    public static function normalizeName(?string $text, array $brandAliases = []): string
    {
        $s = mb_strtolower(trim((string) $text));
        if ($s === '') {
            return '';
        }

        // emoji / pictographs / dingbats / variation selectors
        $s = (string) preg_replace('/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}\x{200D}\x{2190}-\x{21FF}\x{2700}-\x{27BF}]/u', ' ', $s);

        // 【…】 is always promo decoration on Thai marketplaces
        $s = (string) preg_replace('/【[^】]*】/u', ' ', $s);

        // […] / (…) / {…}: drop the segment when it's promo, keep the words otherwise
        $s = (string) preg_replace_callback('/[\[\(\{]([^\]\)\}]*)[\]\)\}]/u', function ($m) {
            foreach (self::NOISE_BRACKET_HINTS as $hint) {
                if (str_contains($m[1], $hint)) {
                    return ' ';
                }
            }

            return ' '.$m[1].' ';
        }, $s);

        foreach (self::NOISE_PHRASES as $phrase) {
            $s = str_replace($phrase, ' ', $s);
        }

        // brand words are scored separately — keep them out of the name similarity
        $s = self::brandSpacing(self::spaceScripts($s));
        foreach ($brandAliases as $alias) {
            $s = (string) preg_replace(self::aliasPattern($alias), ' ', $s);
        }

        // everything that isn't a letter / mark / digit separates words
        $s = (string) preg_replace('/[^\p{L}\p{M}\p{N}]+/u', ' ', $s);

        return trim((string) preg_replace('/\s+/u', ' ', $s));
    }

    /**
     * Model-number tokens of a text: tokens that contain a digit and are
     * long enough to identify something (letters+digits ≥ 4 chars, or ≥ 5
     * pure digits — the shape of our numeric SKUs). Units ("1100W", "40mm")
     * and short counts are excluded. Keys are upper-case with `-`, `.`, `_`
     * removed, so "LDM-40AX" = "LDM40AX".
     *
     * @return array<string, string> key => original spelling (first seen)
     */
    public static function modelTokens(?string $text): array
    {
        $s = self::spaceScripts(mb_strtoupper((string) $text));
        $raw = preg_split('/[\s\/\\\\,;:+|()\[\]{}【】"\'“”*#!?&=<>~]+/u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        $out = [];
        foreach ($raw as $token) {
            $token = trim($token, '-._');
            // "23159-23166" / "00001-40001" are ranges/lists of codes, not one code
            $parts = preg_match('/^[\d\-]+$/', $token) ? explode('-', $token) : [$token];
            foreach ($parts as $part) {
                $key = str_replace(['-', '.', '_'], '', $part);
                if ($key === '' || ! preg_match('/\d/', $key) || ! preg_match('/^[A-Z0-9]+$/', $key)) {
                    continue;
                }
                if (preg_match(self::UNIT_TOKEN, $key)) {
                    continue;
                }
                $isDigits = ctype_digit($key);
                if (($isDigits && strlen($key) < 5) || (! $isDigits && strlen($key) < 4)) {
                    continue;
                }
                $out[$key] ??= $part;
            }
        }

        return $out;
    }

    /**
     * Keys of the code ranges / lists in a text — "23159-23166",
     * "50375 - 50379", "JE041908-JE041932". A multi-variant listing titled
     * "… 23159-23166" names the first and last code of its family, not the
     * product of this row, so such tokens only count as a weak hint.
     *
     * @return array<string, true>
     */
    public static function rangeTokens(?string $text): array
    {
        $out = [];
        preg_match_all('/([A-Z]*\d{4,}[A-Z]*)\s*-\s*([A-Z]*\d{4,}[A-Z]*)/u', mb_strtoupper((string) $text), $m, PREG_SET_ORDER);
        foreach ($m as $match) {
            $out[$match[1]] = true;
            $out[$match[2]] = true;
        }

        return $out;
    }

    /** canonical unit => spellings (in normalizeName() output) */
    private const MEASURE_UNITS = [
        'mm' => ['mm', 'มม'], 'cm' => ['cm', 'ซม'], 'm' => ['m', 'เมตร', 'ม'], 'in' => ['นิ้ว', 'in', 'inch'],
        'w' => ['w', 'วัตต์'], 'v' => ['v'], 'ah' => ['ah'], 'l' => ['ลิตร', 'l'], 'ml' => ['ml', 'มล'],
        'kg' => ['kg', 'กก'], 'g' => ['g', 'กรัม'], 'psi' => ['psi'], 'lm' => ['lm'], 'หุน' => ['หุน'],
        'pcs' => ['pcs', 'ชิ้น', 'ตัว'],
    ];

    /**
     * Numbers-with-units of a normalizeName()d text ("40 เมตร", "13pcs",
     * "850w") grouped by canonical unit. Used to spot "same kind of product,
     * different size" (40 m vs 70 m laser) which name similarity alone
     * can't tell apart.
     *
     * @return array<string, array<string, true>> unit => numbers
     */
    public static function measures(string $normalized): array
    {
        static $map = null, $pattern = null;
        if ($map === null) {
            $map = [];
            foreach (self::MEASURE_UNITS as $unit => $spellings) {
                foreach ($spellings as $sp) {
                    $map[$sp] = $unit;
                }
            }
            $alts = array_keys($map);
            usort($alts, fn ($a, $b) => mb_strlen($b) <=> mb_strlen($a));
            // a unit glued to more letters ("16 มอเตอร์", "5 mode") isn't a unit
            $pattern = '/(?<![\p{L}\p{N}])(\d+)\s?('.implode('|', array_map(fn ($a) => preg_quote($a, '/'), $alts)).')(?![a-z\p{N}\p{Thai}])/u';
        }

        $out = [];
        if (preg_match_all($pattern, $normalized, $m, PREG_SET_ORDER)) {
            foreach ($m as $match) {
                $out[$map[$match[2]]][ltrim($match[1], '0') ?: '0'] = true;
            }
        }

        return $out;
    }

    /**
     * Unit-wise conflicts: a unit both texts state with no number in common.
     *
     * @return list<string> e.g. ["40 m ≠ 70 m"]
     */
    public static function measureConflicts(array $a, array $b): array
    {
        $out = [];
        foreach ($a as $unit => $numbers) {
            if (isset($b[$unit]) && array_intersect_key($numbers, $b[$unit]) === []) {
                $out[] = implode('/', array_keys($numbers)).' '.$unit.' ≠ '.implode('/', array_keys($b[$unit])).' '.$unit;
            }
        }

        return $out;
    }

    /**
     * pg_trgm-compatible trigram set: words = runs of letters/marks/digits,
     * each padded "  word " → every 3-character window.
     *
     * @return array<string, true>
     */
    public static function trigrams(string $normalized): array
    {
        $set = [];
        foreach (preg_split('/[^\p{L}\p{M}\p{N}]+/u', $normalized, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
            $chars = mb_str_split('  '.$word.' ');
            for ($i = 0, $n = count($chars) - 2; $i < $n; $i++) {
                $set[$chars[$i].$chars[$i + 1].$chars[$i + 2]] = true;
            }
        }

        return $set;
    }

    /**
     * Name similarity 0..1 between a listing name and a (shorter) PIM name,
     * both already normalizeName()d:
     *   0.5 × Jaccard (pg_trgm similarity())
     * + 0.5 × coverage of the PIM name's trigrams by the listing — listing
     *   titles are long (marketing words, specs) so plain Jaccard under-rates
     *   a perfect hit; coverage is damped for very short PIM names (< 20
     *   trigrams) so "ปุ่มล็อค" doesn't "fully match" every title containing it.
     */
    public static function nameSimilarity(array $listingTrigrams, array $productTrigrams): float
    {
        $p = count($productTrigrams);
        $l = count($listingTrigrams);
        if ($p === 0 || $l === 0) {
            return 0.0;
        }
        $common = count(array_intersect_key($listingTrigrams, $productTrigrams));
        $jaccard = $common / ($p + $l - $common);
        $coverage = ($common / $p) * min(1.0, $p / 20);

        return round(0.5 * $jaccard + 0.5 * $coverage, 4);
    }

    /**
     * Whole-word regex for a normalised brand alias. Latin aliases need a
     * word boundary ("st" must not hit "steel"); Thai has no spaces between
     * words, so a Thai alias matches anywhere.
     */
    public static function aliasPattern(string $alias): string
    {
        $quoted = preg_quote($alias, '/');

        return preg_match('/\p{Thai}/u', $alias)
            ? '/'.$quoted.'/u'
            : '/(?<![\p{L}\p{N}])'.$quoted.'(?![\p{L}\p{N}])/u';
    }

    /** lower-case text with `-`/`_` as spaces — the form brand aliases are matched in. */
    public static function brandSpacing(string $text): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', str_replace(['-', '_'], ' ', mb_strtolower($text))));
    }

    /** "PUMPKINใบเพชร" → "PUMPKIN ใบเพชร": a script change is a word break. */
    public static function spaceScripts(string $text): string
    {
        return (string) preg_replace('/(?<=[\p{Thai}])(?=[A-Za-z0-9])|(?<=[A-Za-z0-9])(?=[\p{Thai}])/u', ' ', $text);
    }
}
