<?php

namespace App\Services\Lazada;

/**
 * Heuristic ranking aid for the bulk category-mapping review tool
 * (CategoryController::lazadaMapping) — scores how likely a local category
 * is to correspond to a given Lazada leaf category, based on English-name
 * token overlap. This is NOT an auto-mapper: scores only drive suggestion
 * ordering in the UI, and nothing is persisted until a human clicks one.
 * Stateless/pure so it can be unit-tested without a DB connection.
 */
class LazadaCategoryMatcher
{
    private const STOPWORDS = ['and', 'or', 'the', 'a', 'of', 'for', 'with', 'to', 'in'];

    private const LEAF_WEIGHT = 0.75;

    private const PARENT_WEIGHT = 0.25;

    /**
     * Lowercase, strip punctuation, split into words, drop stopwords and
     * single-character tokens (units/initials like "x" carry no matching
     * signal on their own).
     *
     * @return list<string>
     */
    public static function tokenize(string $text): array
    {
        $text = strtolower($text);
        $text = preg_replace('/[^a-z0-9\s]/', ' ', $text) ?? '';
        $tokens = preg_split('/\s+/', trim($text)) ?: [];

        return array_values(array_filter(
            $tokens,
            fn (string $token) => mb_strlen($token) > 1 && !in_array($token, self::STOPWORDS, true)
        ));
    }

    /**
     * @param  list<string>  $a
     * @param  list<string>  $b
     */
    private static function jaccard(array $a, array $b): float
    {
        if (empty($a) || empty($b)) {
            return 0.0;
        }

        $setA = array_unique($a);
        $setB = array_unique($b);

        $intersection = count(array_intersect($setA, $setB));
        $union = count(array_unique([...$setA, ...$setB]));

        return $union > 0 ? $intersection / $union : 0.0;
    }

    /**
     * Scores one local category (already tokenized) against every candidate
     * Lazada leaf category and returns the top N above a small noise floor.
     *
     * @param  list<string>  $leafTokens  tokens of the local category's own name_eng
     * @param  list<string>  $parentTokens  tokens of the local category's ancestor name_eng chain
     * @param  list<array{id: int, name: string, path: string, tokens: list<string>, parentTokens: list<string>}>  $candidates
     * @return list<array{id: int, name: string, path: string, score: float}>
     */
    public static function suggest(array $leafTokens, array $parentTokens, array $candidates, int $limit = 5): array
    {
        $scored = [];

        foreach ($candidates as $candidate) {
            $score = self::LEAF_WEIGHT * self::jaccard($leafTokens, $candidate['tokens'])
                + self::PARENT_WEIGHT * self::jaccard($parentTokens, $candidate['parentTokens']);

            if ($score <= 0.05) {
                continue;
            }

            $scored[] = [
                'id' => $candidate['id'],
                'name' => $candidate['name'],
                'path' => $candidate['path'],
                'score' => round($score * 100, 1),
            ];
        }

        usort($scored, fn (array $a, array $b) => $b['score'] <=> $a['score']);

        return array_slice($scored, 0, $limit);
    }
}
