<?php

namespace App\Console\Commands;

use App\Services\WordPress\TranslatePressTranslationSyncService;
use App\Services\WordPress\WordPressDatabase;
use App\Services\WordPress\WordPressTunnel;
use Illuminate\Console\Command;

/**
 * Fills English translations into TranslatePress's dictionary table for
 * products already live on WooCommerce — see
 * TranslatePressTranslationSyncService's docblock for the exact safety
 * scope (only products TranslatePress has already seen rendered on a real
 * page get touched; everything else is skipped, not guessed).
 *
 * Opens/closes its own SSH tunnel for the run (see WordPressTunnel) — there
 * is no persistent tunnel to depend on being already up.
 */
class FillWooCommerceTranslations extends Command
{
    protected $signature = 'app:fill-woocommerce-translations';

    protected $description = 'Fill English translations into TranslatePress for WooCommerce products it already knows about';

    public function handle(): int
    {
        $tunnel = new WordPressTunnel();

        $this->info('Opening SSH tunnel to the WordPress database...');
        $tunnel->open();

        try {
            $db = new WordPressDatabase($tunnel->localPort());

            try {
                $service = new TranslatePressTranslationSyncService($db);
                $stats = $service->fillMissingProductNameTranslations();
            } finally {
                $db->close();
            }
        } finally {
            $tunnel->close();
        }

        $this->info(sprintf(
            'Considered %d WooCommerce-live products: %d translations upserted, %d skipped (no English name in PIM), %d skipped (TranslatePress doesn\'t know this string yet), %d skipped (product no longer exists in PIM).',
            $stats['considered'],
            $stats['upserted'],
            $stats['skipped_no_english_name'],
            $stats['skipped_not_tracked'],
            $stats['skipped_product_missing'],
        ));

        foreach ($stats['errors'] as $error) {
            $this->warn($error);
        }

        return self::SUCCESS;
    }
}
