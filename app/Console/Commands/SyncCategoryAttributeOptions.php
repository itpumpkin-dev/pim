<?php

namespace App\Console\Commands;

use App\Services\Catalog\MasterAttributeOptionSync;
use Illuminate\Console\Command;

/**
 * Rebuilds the option list of every `select` attribute that has a
 * `master_source` (Categories / Subcategories / Product Groups / Points /
 * Commission Groups / Business Types / Vendors / Currencies) straight from
 * that master. Each attribute's current options are deleted and regenerated,
 * so this is the way to reconcile after bulk edits or a source rebind gone
 * wrong. Steady-state, model events keep them in sync automatically.
 */
class SyncCategoryAttributeOptions extends Command
{
    protected $signature = 'catalog:sync-master-options';

    protected $description = 'Rebuild every master_source-bound select attribute\'s options from its master';

    public function handle(MasterAttributeOptionSync $sync): int
    {
        if (! $this->confirm('This deletes and rebuilds the options of every attribute that has a master_source. Continue?', true)) {
            $this->warn('Aborted.');

            return self::SUCCESS;
        }

        $count = $sync->rebuildAll();

        $this->info("Rebuilt options for {$count} master-bound attribute(s).");

        return self::SUCCESS;
    }
}
