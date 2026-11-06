<?php

namespace App\Console\Commands;

use App\Services\Marketplace\Listings\ProductMatchIndexBuilder;
use Illuminate\Console\Command;

/**
 * Rebuilds product_match_index (phase 3A) — the flattened, normalised
 * name/brand/price/model-token row per PIM product the score-based
 * suggester searches. Also done automatically at the start of every
 * listing sync run.
 */
class RebuildProductMatchIndexCommand extends Command
{
    protected $signature = 'marketplace:rebuild-match-index';

    protected $description = 'Rebuild product_match_index (search table for score-based product matching suggestions)';

    public function handle(ProductMatchIndexBuilder $builder): int
    {
        $result = $builder->rebuild();
        $this->info("Indexed {$result['products']} products in {$result['ms']} ms");

        return self::SUCCESS;
    }
}
