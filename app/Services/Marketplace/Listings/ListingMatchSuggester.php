<?php

namespace App\Services\Marketplace\Listings;

use App\Models\Attribute;
use Illuminate\Support\Facades\DB;

/**
 * Product Matching phase 2 — ranked link suggestions for listings the exact
 * SKU auto-matcher couldn't place. Read-only: it never writes anything, the
 * matching actions apply a suggestion only when a person confirms it.
 *
 * Rules, in rank order (a–d = confidence 'high', the only ones bulk-accept
 * applies):
 *  a. normalized — equal ignoring case and whitespace (`abc 01` = `ABC01`)
 *  b. trimmed    — trailing `.`/`-`/`_` stripped (`50374.` → 50374)
 *  c. prefix     — a known prefix stripped (`TX-31345` → 31345), only when
 *                  the remainder is a PIM SKU
 *  d. pack       — `<base>_<N>` (N = 1–3 digits) where base is a PIM SKU →
 *                  pack_quantity N (`15123_5` = 5× 15123). The same with a
 *                  dash (`MG-6001-10`) is suggested too but only as 'medium'
 *                  — `<sku>-<n>` is just as often a different product.
 *  e. bundle     — `A+B(+C…)` where every part is a PIM SKU, qty 1 each, or
 *                  `A*2` / `Ax2` / `A×2` → qty 2 (medium)
 *  f. barcode    — an 8–14 digit SKU equal to a product's barcode_pcs value
 *                  (medium); barcode_box / barcode_ctn are reported too but
 *                  as 'low' — the pack size of a box/carton isn't known.
 *
 * Every candidate SKU is compared in normalized form (rule a's key). A key
 * that resolves to more than one product is ambiguous and skipped — unless
 * exactly one of them equals the candidate verbatim. Same for a barcode
 * shared by several products.
 *
 * Set-based: suggest() takes a whole page (or shop) of listings and resolves
 * every candidate with one products query (+ one product_values query for
 * barcodes) per 1000 keys — no per-row queries.
 */
class ListingMatchSuggester
{
    public const TYPE_NORMALIZED = 'normalized';

    public const TYPE_TRIMMED = 'trimmed';

    public const TYPE_PREFIX = 'prefix';

    public const TYPE_PACK = 'pack';

    public const TYPE_BUNDLE = 'bundle';

    public const TYPE_BARCODE = 'barcode';

    public const HIGH_TYPES = [self::TYPE_NORMALIZED, self::TYPE_TRIMMED, self::TYPE_PREFIX, self::TYPE_PACK];

    public const PREFIXES = ['TX-', 'SP-', 'P-'];

    /** barcode attribute code => confidence */
    public const BARCODE_ATTRIBUTES = ['barcode_pcs' => 'medium', 'barcode_box' => 'low', 'barcode_ctn' => 'low'];

    private const BARCODE_LABEL = ['barcode_pcs' => 'บาร์โค้ดชิ้น', 'barcode_box' => 'บาร์โค้ดกล่อง', 'barcode_ctn' => 'บาร์โค้ดลัง'];

    private const CHUNK = 1000;

    /**
     * @param  array<int, string|null>  $skusByListingId  listing id => seller_sku
     * @return array<int, list<array{type: string, confidence: string, items: list<array{product_id: int, sku: string, quantity: int}>, pack_quantity: int|null, reason: string}>>
     *                                                                                                                                                                             listing id => suggestions, best first (listings without any are omitted)
     */
    public function suggest(array $skusByListingId): array
    {
        $plansByListing = [];
        $keys = [];
        $barcodes = [];

        foreach ($skusByListingId as $listingId => $sku) {
            $plans = $this->plans((string) $sku);
            if ($plans === []) {
                continue;
            }
            $plansByListing[$listingId] = $plans;
            foreach ($plans as $plan) {
                if ($plan['type'] === self::TYPE_BARCODE) {
                    $barcodes[$plan['barcode']] = true;

                    continue;
                }
                foreach ($plan['parts'] as $part) {
                    foreach ($part as [$candidate]) {
                        $keys[self::normalize($candidate)] = true;
                    }
                }
            }
        }

        $products = $this->productsByKey(array_keys($keys));
        $barcodeHits = $this->productsByBarcode(array_keys($barcodes));

        $result = [];
        foreach ($plansByListing as $listingId => $plans) {
            $suggestions = [];
            $seen = [];
            foreach ($plans as $plan) {
                foreach ($this->resolvePlan($plan, $products, $barcodeHits) as $suggestion) {
                    $signature = self::signature($suggestion);
                    if (isset($seen[$signature])) {
                        continue;
                    }
                    $seen[$signature] = true;
                    $suggestions[] = $suggestion;
                }
            }
            if ($suggestions !== []) {
                $result[$listingId] = $suggestions;
            }
        }

        return $result;
    }

    public static function isHigh(array $suggestion): bool
    {
        return ($suggestion['confidence'] ?? null) === 'high';
    }

    public static function normalize(string $sku): string
    {
        return mb_strtolower((string) preg_replace('/\s+/u', '', $sku));
    }

    /**
     * Candidate plans for one seller SKU, in rank order. A plan's `parts` is
     * a list of components; each component is a list of alternatives
     * [candidate SKU, quantity] tried in order.
     *
     * @return list<array<string, mixed>>
     */
    private function plans(string $sku): array
    {
        $raw = trim($sku);
        if ($raw === '') {
            return [];
        }

        $plans = [];
        $single = fn (string $type, string $candidate, ?int $pack, string $reason, array $extra = []) => array_merge([
            'type' => $type,
            'parts' => [[[$candidate, 1]]],
            'pack_quantity' => $pack,
            'reason' => $reason,
        ], $extra);

        // a. normalized equal
        $plans[] = $single(self::TYPE_NORMALIZED, $raw, null, 'SKU ตรงกันเมื่อไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง');

        // b. trailing punctuation
        $trimmed = rtrim($raw, ".-_ \t");
        if ($trimmed !== '' && $trimmed !== $raw) {
            $plans[] = $single(self::TYPE_TRIMMED, $trimmed, null, "ตัดเครื่องหมายท้าย SKU ออก ({$raw} → {$trimmed})");
        }
        $base = $trimmed !== '' ? $trimmed : $raw;

        // c. known prefix
        $unprefixed = null;
        foreach (self::PREFIXES as $prefix) {
            if (stripos($base, $prefix) === 0 && strlen($base) > strlen($prefix)) {
                $unprefixed = substr($base, strlen($prefix));
                $plans[] = $single(self::TYPE_PREFIX, $unprefixed, null, "ตัด prefix \"{$prefix}\" ออก ({$base} → {$unprefixed})");
                break;
            }
        }

        // d. pack suffix `<base>_<N>` (also after a prefix strip); `<base>-<N>`
        //    only as medium
        foreach (array_filter([$base, $unprefixed]) as $candidate) {
            if (preg_match('/^(.+)_(\d{1,3})$/u', $candidate, $m) && (int) $m[2] >= 1) {
                $n = (int) $m[2];
                $plans[] = $single(self::TYPE_PACK, $m[1], $n, "SKU ลงท้าย _{$n} = แพ็ก {$n} ชิ้นของ {$m[1]}");
            }
        }
        foreach (array_filter([$base, $unprefixed]) as $candidate) {
            if (preg_match('/^(.+)-(\d{1,3})$/u', $candidate, $m) && (int) $m[2] >= 2) {
                $n = (int) $m[2];
                $plans[] = $single(self::TYPE_PACK, $m[1], $n, "SKU ลงท้าย -{$n} — อาจเป็นแพ็ก {$n} ชิ้นของ {$m[1]} (ตรวจสอบก่อนยืนยัน)", ['confidence' => 'medium']);
            }
        }

        // e. bundle `A+B(+C)`, `A*2` / `Ax2` → qty 2
        if (str_contains($base, '+')) {
            $parts = array_values(array_filter(array_map('trim', explode('+', $base)), fn ($p) => $p !== ''));
            if (count($parts) >= 2) {
                $components = [];
                foreach ($parts as $part) {
                    $alternatives = [[$part, 1]];
                    if (preg_match('/^(.+?)\s*[*xX×]\s*(\d{1,3})$/u', $part, $m) && (int) $m[2] >= 1) {
                        $alternatives[] = [trim($m[1]), (int) $m[2]];
                    }
                    $components[] = $alternatives;
                }
                $plans[] = [
                    'type' => self::TYPE_BUNDLE,
                    'parts' => $components,
                    'pack_quantity' => null,
                    'reason' => 'SKU คั่นด้วย "+" และทุกส่วนมีใน PIM',
                ];
            }
        }

        // f. barcode
        if (preg_match('/^\d{8,14}$/', $raw)) {
            $plans[] = ['type' => self::TYPE_BARCODE, 'barcode' => $raw];
        }

        return $plans;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function resolvePlan(array $plan, array $products, array $barcodeHits): array
    {
        if ($plan['type'] === self::TYPE_BARCODE) {
            $out = [];
            foreach ($barcodeHits[$plan['barcode']] ?? [] as $code => $product) {
                $out[] = [
                    'type' => self::TYPE_BARCODE,
                    'confidence' => self::BARCODE_ATTRIBUTES[$code],
                    'items' => [['product_id' => $product['id'], 'sku' => $product['sku'], 'quantity' => 1]],
                    'pack_quantity' => null,
                    'reason' => 'ตรงกับ'.self::BARCODE_LABEL[$code]." ของ {$product['sku']}",
                ];
            }

            return $out;
        }

        $items = [];
        foreach ($plan['parts'] as $alternatives) {
            $resolved = null;
            foreach ($alternatives as [$candidate, $qty]) {
                $product = $this->pick($products[self::normalize($candidate)] ?? [], $candidate);
                if ($product !== null) {
                    $resolved = ['product_id' => $product['id'], 'sku' => $product['sku'], 'quantity' => $qty];
                    break;
                }
            }
            if ($resolved === null) {
                return [];
            }
            // same product twice in a bundle (`A+A`) → one item, summed qty
            $key = $resolved['product_id'];
            if (isset($items[$key])) {
                $items[$key]['quantity'] += $resolved['quantity'];
            } else {
                $items[$key] = $resolved;
            }
        }
        $items = array_values($items);
        $type = $plan['type'];
        $pack = $plan['pack_quantity'];

        if ($type === self::TYPE_BUNDLE && count($items) === 1) {
            // `A+A` / `A*2` alone is really a pack of one product
            $type = self::TYPE_PACK;
            $pack = $items[0]['quantity'];
            $items[0]['quantity'] = 1;
            $plan['confidence'] = 'medium';
        }

        return [[
            'type' => $type,
            'confidence' => $plan['confidence'] ?? (in_array($type, self::HIGH_TYPES, true) ? 'high' : 'medium'),
            'items' => $items,
            'pack_quantity' => $pack,
            'reason' => $plan['reason'],
        ]];
    }

    /**
     * @param  list<array{id: int, sku: string}>  $matches
     */
    private function pick(array $matches, string $candidate): ?array
    {
        if (count($matches) === 1) {
            return $matches[0];
        }
        $exact = array_values(array_filter($matches, fn ($p) => $p['sku'] === $candidate));

        return count($exact) === 1 ? $exact[0] : null;
    }

    /**
     * @param  list<string>  $keys
     * @return array<string, list<array{id: int, sku: string}>>
     */
    private function productsByKey(array $keys): array
    {
        $out = [];
        foreach (array_chunk($keys, self::CHUNK) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '?'));
            $rows = DB::select(
                "SELECT id, sku, lower(regexp_replace(sku, '\\s', '', 'g')) AS k
                   FROM products
                  WHERE lower(regexp_replace(sku, '\\s', '', 'g')) IN ({$placeholders})",
                $chunk
            );
            foreach ($rows as $row) {
                $out[$row->k][] = ['id' => (int) $row->id, 'sku' => $row->sku];
            }
        }

        return $out;
    }

    /**
     * @param  list<string>  $barcodes
     * @return array<string, array<string, array{id: int, sku: string}>> barcode => attribute code => product (only unambiguous hits)
     */
    private function productsByBarcode(array $barcodes): array
    {
        if ($barcodes === []) {
            return [];
        }
        $attributeIds = [];
        foreach (array_keys(self::BARCODE_ATTRIBUTES) as $code) {
            $id = Attribute::idForCode($code);
            if ($id) {
                $attributeIds[$id] = $code;
            }
        }
        if ($attributeIds === []) {
            return [];
        }

        $found = [];
        foreach (array_chunk($barcodes, self::CHUNK) as $chunk) {
            $rows = DB::table('product_values')
                ->join('products', 'products.id', '=', 'product_values.product_id')
                ->whereIn('product_values.attribute_id', array_keys($attributeIds))
                ->whereIn(DB::raw('btrim(product_values.value)'), $chunk)
                ->distinct()
                ->get([DB::raw('btrim(product_values.value) AS barcode'), 'product_values.attribute_id', 'products.id', 'products.sku']);
            foreach ($rows as $row) {
                $found[$row->barcode][$attributeIds[$row->attribute_id]][(int) $row->id] = ['id' => (int) $row->id, 'sku' => $row->sku];
            }
        }

        $out = [];
        foreach ($found as $barcode => $byCode) {
            foreach (array_keys(self::BARCODE_ATTRIBUTES) as $code) {
                if (isset($byCode[$code]) && count($byCode[$code]) === 1) {
                    $out[$barcode][$code] = array_values($byCode[$code])[0];
                }
            }
        }

        return $out;
    }

    private static function signature(array $suggestion): string
    {
        $items = array_map(fn ($i) => $i['product_id'].'x'.$i['quantity'], $suggestion['items']);
        sort($items);

        return implode(',', $items).'|'.($suggestion['pack_quantity'] ?? '');
    }
}
