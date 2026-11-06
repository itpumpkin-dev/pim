<?php

namespace App\Services\Marketplace\Listings;

use App\Models\MarketplaceListing;
use Illuminate\Support\Facades\DB;

/**
 * Product Matching phase 3A — score-based suggestions ("ชื่อ/แบรนด์
 * ใกล้เคียง") for unmatched, non-ignored listings that have NO rule-based
 * ListingMatchSuggester suggestion (their SKU just isn't in PIM). Up to
 * MAX_PER_LISTING products per listing, scored by ListingScorer, persisted
 * to marketplace_listing_suggestions (replacing the shop's previous set).
 * Always confidence 'low' — never bulk-accepted, never auto-linked.
 *
 * Batched, per shop:
 *  1. listing features in PHP (MatchText — same normalisation as
 *     product_match_index);
 *  2. candidates, two queries for the whole shop:
 *     - pg_trgm: top TRGM_CANDIDATES products per listing by trigram
 *       similarity of the normalised name (GIN-indexed `%` operator, with
 *       a lowered pg_trgm.similarity_threshold for this transaction),
 *     - model tokens: every product sharing a listing's model-number token
 *       (+ how many products carry each token, for rarity);
 *     without pg_trgm only the model-token candidates are used (fallback);
 *  3. one query for the candidates' index rows, score in PHP, keep top 3;
 *  4. delete + insert the shop's rows in one transaction.
 */
class ListingScoreSuggester
{
    public const TYPE = 'similar';

    public const MAX_PER_LISTING = 3;

    private const TRGM_CANDIDATES = 15;

    private const TRGM_THRESHOLD = 0.12;

    private const CHUNK = 200;

    private ?bool $trgm = null;

    public function __construct(private readonly ListingMatchSuggester $ruleSuggester) {}

    public function trigramAvailable(): bool
    {
        return $this->trgm ??= DB::getDriverName() === 'pgsql'
            && DB::selectOne("SELECT 1 AS ok FROM pg_extension WHERE extname = 'pg_trgm'") !== null;
    }

    /**
     * Recomputes and stores the score suggestions of one shop.
     *
     * @return array{listings: int, considered: int, suggested: int, rows: int, ms: int}
     */
    public function computeForShop(int $shopId, ?BrandDictionary $brands = null): array
    {
        $started = microtime(true);
        $brands ??= BrandDictionary::fromDatabase();

        $open = MarketplaceListing::query()
            ->where('sales_platform_shop_id', $shopId)
            ->unlinked()
            ->get(['id', 'seller_sku', 'name', 'price']);

        $ruled = $this->ruleSuggester->suggest($open->pluck('seller_sku', 'id')->all());
        $todo = $open->reject(fn (MarketplaceListing $l) => isset($ruled[$l->id]))->values();

        $results = $this->suggestFor($todo->map(fn (MarketplaceListing $l) => [
            'id' => $l->id,
            'name' => $l->name,
            'seller_sku' => $l->seller_sku,
            'price' => $l->price !== null ? (float) $l->price : null,
        ])->all(), $brands);

        $now = now();
        $insert = [];
        foreach ($results as $listingId => $suggestions) {
            foreach ($suggestions as $rank => $s) {
                $insert[] = [
                    'marketplace_listing_id' => $listingId,
                    'product_id' => $s['product_id'],
                    'score' => $s['score'],
                    'reasons' => json_encode($s['reasons'], JSON_UNESCAPED_UNICODE),
                    'rank' => $rank + 1,
                    'created_at' => $now,
                ];
            }
        }

        DB::transaction(function () use ($shopId, $insert) {
            DB::table('marketplace_listing_suggestions')
                ->whereIn('marketplace_listing_id', fn ($q) => $q->select('id')->from('marketplace_listings')->where('sales_platform_shop_id', $shopId))
                ->delete();
            foreach (array_chunk($insert, 1000) as $chunk) {
                DB::table('marketplace_listing_suggestions')->insert($chunk);
            }
        });

        return [
            'listings' => $open->count(),
            'considered' => $todo->count(),
            'suggested' => count($results),
            'rows' => count($insert),
            'ms' => (int) round((microtime(true) - $started) * 1000),
        ];
    }

    /**
     * Scores candidates for the given listings (no writes).
     *
     * @param  list<array{id: int, name: ?string, seller_sku: ?string, price: ?float}>  $listings
     * @return array<int, list<array{product_id: int, score: int, reasons: list<string>}>> listing id => best first
     */
    public function suggestFor(array $listings, BrandDictionary $brands): array
    {
        if ($listings === []) {
            return [];
        }
        $aliases = $brands->aliases();
        $scorer = new ListingScorer($brands);

        $features = [];
        foreach ($listings as $l) {
            $norm = MatchText::normalizeName($l['name'], $aliases);
            $tokens = MatchText::modelTokens(trim(($l['name'] ?? '').' '.str_replace(['+', '_'], ' ', (string) $l['seller_sku'])));
            if ($norm === '' && $tokens === []) {
                continue;
            }
            $features[$l['id']] = [
                'norm' => $norm,
                'trigrams' => MatchText::trigrams($norm),
                'tokens' => $tokens,
                'range' => MatchText::rangeTokens($l['name']),
                'measures' => MatchText::measures($norm),
                'part' => ListingScorer::isPartListing($l['name'], $l['seller_sku']),
                'brand' => $brands->detect($l['name']),
                'price' => $l['price'],
            ];
        }

        $candidates = [];
        foreach (array_chunk($features, self::CHUNK, true) as $chunk) {
            foreach ($this->trigramCandidates($chunk) as [$listingId, $productId]) {
                $candidates[$listingId][$productId] = true;
            }
        }
        [$tokenProducts, $tokenDf] = $this->tokenCandidates($features);
        foreach ($features as $listingId => $f) {
            foreach (array_keys($f['tokens']) as $key) {
                foreach ($tokenProducts[$key] ?? [] as $productId) {
                    $candidates[$listingId][$productId] = true;
                }
            }
        }

        $products = $this->productFeatures(array_keys(array_replace([], ...array_values($candidates ?: [[]]))));

        $out = [];
        foreach ($candidates as $listingId => $productIds) {
            $scored = [];
            foreach (array_keys($productIds) as $productId) {
                if (! isset($products[$productId])) {
                    continue;
                }
                $result = $scorer->score($features[$listingId], $products[$productId], $tokenDf);
                if ($result !== null) {
                    $scored[] = ['product_id' => $productId, 'sku' => $products[$productId]['sku']] + $result;
                }
            }
            if ($scored === []) {
                continue;
            }
            usort($scored, fn ($a, $b) => $b['score'] <=> $a['score'] ?: strcmp($a['sku'], $b['sku']));
            $out[$listingId] = array_map(
                fn ($s) => ['product_id' => $s['product_id'], 'score' => $s['score'], 'reasons' => $s['reasons']],
                array_slice($scored, 0, self::MAX_PER_LISTING)
            );
        }

        return $out;
    }

    /**
     * @param  array<int, array{norm: string}>  $features
     * @return list<array{0: int, 1: int}> [listing id, product id]
     */
    private function trigramCandidates(array $features): array
    {
        if (! $this->trigramAvailable()) {
            return [];
        }
        $queries = [];
        foreach ($features as $listingId => $f) {
            if (mb_strlen($f['norm']) >= 3) {
                $queries[] = ['lid' => $listingId, 'q' => $f['norm']];
            }
        }
        if ($queries === []) {
            return [];
        }

        return DB::transaction(function () use ($queries) {
            DB::statement('SET LOCAL pg_trgm.similarity_threshold = '.self::TRGM_THRESHOLD);
            $rows = DB::select(
                'SELECT q.lid, c.product_id
                   FROM json_to_recordset(?::json) AS q(lid bigint, q text)
                   CROSS JOIN LATERAL (
                        SELECT i.product_id
                          FROM product_match_index i
                         WHERE i.name_th % q.q OR i.name_en % q.q
                         ORDER BY greatest(similarity(i.name_th, q.q), coalesce(similarity(i.name_en, q.q), 0)) DESC
                         LIMIT '.self::TRGM_CANDIDATES.'
                   ) c',
                [json_encode($queries, JSON_UNESCAPED_UNICODE)]
            );

            return array_map(fn ($r) => [(int) $r->lid, (int) $r->product_id], $rows);
        });
    }

    /**
     * @param  array<int, array{tokens: array<string, string>}>  $features
     * @return array{0: array<string, list<int>>, 1: array<string, int>} token => product ids (only tokens shared by ≤ COMMON_DF products), token => df
     */
    private function tokenCandidates(array $features): array
    {
        $keys = [];
        foreach ($features as $f) {
            foreach (array_keys($f['tokens']) as $key) {
                $keys[(string) $key] = true;
            }
        }
        if ($keys === []) {
            return [[], []];
        }

        $byToken = [];
        foreach (array_chunk(array_keys($keys), 1000) as $chunk) {
            $rows = DB::select(
                "SELECT t.tok, i.product_id
                   FROM product_match_index i
                   CROSS JOIN LATERAL unnest(string_to_array(btrim(i.model_tokens), ' ')) AS t(tok)
                  WHERE i.model_tokens IS NOT NULL
                    AND t.tok = ANY(?::text[])",
                ['{'.implode(',', array_map(fn ($k) => '"'.$k.'"', $chunk)).'}']
            );
            foreach ($rows as $r) {
                $byToken[$r->tok][(int) $r->product_id] = true;
            }
        }

        $products = [];
        $df = [];
        foreach ($byToken as $tok => $ids) {
            $df[$tok] = count($ids);
            if (count($ids) <= ListingScorer::COMMON_DF) {
                $products[$tok] = array_keys($ids);
            }
        }

        return [$products, $df];
    }

    /**
     * @param  list<int>  $productIds
     * @return array<int, array{sku: string, th: array<string, true>, en: array<string, true>, tokens: list<string>, brand: ?string, price: ?float}>
     */
    private function productFeatures(array $productIds): array
    {
        $out = [];
        foreach (array_chunk($productIds, 1000) as $chunk) {
            $rows = DB::table('product_match_index')->whereIn('product_id', $chunk)
                ->get(['product_id', 'sku', 'name_th', 'name_en', 'brand_code', 'price', 'model_tokens']);
            foreach ($rows as $r) {
                $out[(int) $r->product_id] = [
                    'sku' => $r->sku,
                    'th' => MatchText::trigrams((string) $r->name_th),
                    'en' => MatchText::trigrams((string) $r->name_en),
                    'measures' => MatchText::measures((string) ($r->name_th ?? $r->name_en)),
                    'tokens' => preg_split('/\s+/', trim((string) $r->model_tokens), -1, PREG_SPLIT_NO_EMPTY) ?: [],
                    'brand' => $r->brand_code,
                    'price' => $r->price !== null ? (float) $r->price : null,
                ];
            }
        }

        return $out;
    }
}
