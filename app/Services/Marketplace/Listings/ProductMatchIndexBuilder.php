<?php

namespace App\Services\Marketplace\Listings;

use App\Models\Attribute;
use App\Models\Locale;
use Illuminate\Support\Facades\DB;

/**
 * Fills product_match_index (phase 3A): one row per PIM product with its EAV
 * data flattened and normalised for matching —
 *
 *   name_th / name_en  pname (th / en locale, falling back to the
 *                      locale-less value), MatchText::normalizeName()d with
 *                      brand words stripped; name_en only when it differs
 *   brand_code/label   pbrand option; when empty, the brand the name
 *                      mentions (BrandDictionary::detect) — most products
 *                      have no pbrand but are titled "NETTO …", "PUMPKIN …"
 *   price              price_recommend, else price (locale/channel-less)
 *   model_tokens       MatchText::modelTokens() of the names + `model`
 *                      attribute + the SKU, as " KEY1 KEY2 "
 *
 * Full rebuild, in one transaction (readers keep seeing the old rows until
 * commit): one pivot query over product_values, normalisation in PHP (the
 * same code that normalises listing names), chunked inserts. ~22k products
 * locally — see the phase 3A report for timings. A full rebuild is used
 * rather than an updated_at delta because product_values edits don't
 * touch products.updated_at.
 */
class ProductMatchIndexBuilder
{
    private const CHUNK = 1000;

    /**
     * @return array{products: int, ms: int}
     */
    public function rebuild(?BrandDictionary $brands = null): array
    {
        $started = microtime(true);
        $brands ??= BrandDictionary::fromDatabase();
        $aliases = $brands->aliases();

        $attr = fn (string $code) => Attribute::idForCode($code) ?? 0;
        $nameId = $attr('pname');
        $brandId = $attr('pbrand');
        $priceRecId = $attr('price_recommend');
        $priceId = $attr('price');
        $modelId = $attr('model');
        $th = Locale::idForCode('th') ?? 0;
        $en = Locale::idForCode('en') ?? 0;

        $rows = DB::select(
            'SELECT p.id, p.sku,
                    max(CASE WHEN v.attribute_id = :n1 AND v.locale_id = :th THEN v.value END) AS name_th,
                    max(CASE WHEN v.attribute_id = :n2 AND v.locale_id = :en THEN v.value END) AS name_en,
                    max(CASE WHEN v.attribute_id = :n3 AND v.locale_id IS NULL THEN v.value END) AS name_any,
                    max(CASE WHEN v.attribute_id = :b THEN v.value END) AS brand,
                    max(CASE WHEN v.attribute_id = :pr THEN v.value END) AS price_rec,
                    max(CASE WHEN v.attribute_id = :p THEN v.value END) AS price,
                    string_agg(DISTINCT CASE WHEN v.attribute_id = :m THEN v.value END, \' \') AS model
               FROM products p
               LEFT JOIN product_values v
                      ON v.product_id = p.id AND v.channel_id IS NULL
                     AND v.attribute_id IN (:n4, :b2, :pr2, :p2, :m2)
                     AND v.value IS NOT NULL AND v.value <> \'\'
              WHERE p.is_raw_material IS NOT TRUE
              GROUP BY p.id, p.sku',
            [
                'n1' => $nameId, 'th' => $th, 'n2' => $nameId, 'en' => $en, 'n3' => $nameId,
                'b' => $brandId, 'pr' => $priceRecId, 'p' => $priceId, 'm' => $modelId,
                'n4' => $nameId, 'b2' => $brandId, 'pr2' => $priceRecId, 'p2' => $priceId, 'm2' => $modelId,
            ]
        );

        $now = now();
        $insert = [];
        foreach ($rows as $r) {
            $nameTh = $r->name_th ?: $r->name_any;
            $nameEn = $r->name_en ?: $nameTh; // ยังไม่แปล → ชื่อไทย (LocaleFallback: en → th → แถว NULL)
            $normTh = MatchText::normalizeName($nameTh, $aliases);
            $normEn = MatchText::normalizeName($nameEn, $aliases);

            $brandCode = $r->brand && $brands->has($r->brand) ? $r->brand : ($brands->detect($nameTh) ?? $brands->detect($nameEn));

            $tokens = MatchText::modelTokens(implode(' ', array_filter([$nameTh, $nameEn, $r->model, $r->sku])));

            $insert[] = [
                'product_id' => $r->id,
                'sku' => $r->sku,
                'name_th' => $normTh !== '' ? $normTh : null,
                'name_en' => $normEn !== '' && $normEn !== $normTh ? $normEn : null,
                'brand_code' => $brandCode,
                'brand_label' => $brands->label($brandCode),
                'price' => self::price($r->price_rec) ?? self::price($r->price),
                'model_tokens' => $tokens === [] ? null : ' '.implode(' ', array_keys($tokens)).' ',
                'updated_at' => $now,
            ];
        }

        DB::transaction(function () use ($insert) {
            DB::table('product_match_index')->delete();
            foreach (array_chunk($insert, self::CHUNK) as $chunk) {
                DB::table('product_match_index')->insert($chunk);
            }
        });

        // Bulk inserts land in the GIN indexes' "pending list", which every
        // trigram search then scans linearly until autovacuum merges it —
        // measured: the first shop's suggestions took 80–90 s right after a
        // rebuild vs ~2 s once merged. Merge it now, and refresh statistics.
        if (DB::getDriverName() === 'pgsql') {
            $ginIndexes = DB::select("SELECT indexname FROM pg_indexes WHERE tablename = 'product_match_index' AND indexdef ILIKE '%USING gin%'");
            foreach ($ginIndexes as $index) {
                try {
                    DB::select('SELECT gin_clean_pending_list(?::regclass)', [$index->indexname]);
                } catch (\Throwable $e) {
                    // only a speed issue (needs index ownership) — never fail the rebuild over it
                    report($e);
                }
            }
            DB::statement('ANALYZE product_match_index');
        }

        return ['products' => count($insert), 'ms' => (int) round((microtime(true) - $started) * 1000)];
    }

    private static function price(?string $value): ?float
    {
        if ($value === null) {
            return null;
        }
        $clean = str_replace([',', ' ', '฿'], '', $value);
        // 9999 / 99999 are "no price yet" placeholders in PIM
        if (preg_match('/^9{4,}(\.0+)?$/', $clean)) {
            return null;
        }

        return is_numeric($clean) && (float) $clean > 0 && (float) $clean < 10_000_000 ? round((float) $clean, 2) : null;
    }
}
