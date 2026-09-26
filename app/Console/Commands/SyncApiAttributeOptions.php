<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Services\Catalog\ApiAttributeOptionSync;
use Illuminate\Console\Command;

/**
 * Rebuilds the option list of every attribute bound to an AttributeApiSource
 * by re-fetching and re-mapping that source's endpoint. Kept as its own
 * command (rather than folded into catalog:sync-master-options) since it
 * hits the network and admins may want to run/schedule it independently of
 * the internal-master sync.
 */
class SyncApiAttributeOptions extends Command
{
    protected $signature = 'catalog:sync-api-options';

    protected $description = 'Rebuild every API-source-bound attribute\'s options from its external API';

    public function handle(ApiAttributeOptionSync $sync): int
    {
        if (! $this->confirm('This deletes and rebuilds the options of every attribute bound to an API source. Continue?', true)) {
            $this->warn('Aborted.');

            return self::SUCCESS;
        }

        $total = Attribute::whereNotNull('api_source_id')->count();
        $count = $sync->rebuildAll();

        $this->info("Rebuilt options for {$count} of {$total} API-source-bound attribute(s).");
        if ($count < $total) {
            $this->warn(($total - $count).' attribute(s) failed to sync — see the log for details.');
        }

        return self::SUCCESS;
    }
}
