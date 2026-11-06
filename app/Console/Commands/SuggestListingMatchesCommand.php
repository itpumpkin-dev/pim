<?php

namespace App\Console\Commands;

use App\Models\MarketplaceListing;
use App\Services\Marketplace\Listings\BrandDictionary;
use App\Services\Marketplace\Listings\ListingScoreSuggester;
use Illuminate\Console\Command;

/**
 * Recomputes the stored score-based ("ชื่อ/แบรนด์ใกล้เคียง") suggestions of
 * the selected shops from the current product_match_index — DB only, no
 * marketplace calls, nothing is linked. Run `marketplace:rebuild-match-index`
 * first if PIM products changed since the last sync.
 */
class SuggestListingMatchesCommand extends Command
{
    protected $signature = 'marketplace:suggest-matches
        {--shop=* : Shop id(s) (default: every shop that has synced listings)}';

    protected $description = 'Recompute score-based match suggestions (name / brand / price / model number) for unmatched marketplace listings';

    public function handle(ListingScoreSuggester $suggester): int
    {
        $shopIds = array_values(array_filter(array_map('intval', (array) $this->option('shop'))));
        if ($shopIds === []) {
            $shopIds = MarketplaceListing::query()->distinct()->orderBy('sales_platform_shop_id')->pluck('sales_platform_shop_id')->all();
        }
        if (! $suggester->trigramAvailable()) {
            $this->warn('pg_trgm is not installed — using model-number candidates only (fewer suggestions).');
        }

        $brands = BrandDictionary::fromDatabase();
        $started = microtime(true);
        foreach ($shopIds as $shopId) {
            $r = $suggester->computeForShop((int) $shopId, $brands);
            $this->info(sprintf(
                'shop #%d: unmatched=%d without rule suggestion=%d → score-suggested=%d (%d rows) in %d ms',
                $shopId, $r['listings'], $r['considered'], $r['suggested'], $r['rows'], $r['ms']
            ));
        }
        $this->line(sprintf('Done in %.1fs', microtime(true) - $started));

        return self::SUCCESS;
    }
}
