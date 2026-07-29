<?php

namespace App\Console\Commands;

use App\Services\LocaleTranslationService;
use Illuminate\Console\Command;

/**
 * Rebuilds resources/js/locales/{code}/*.json from the DB store
 * (locale_translation_files). Normal admin edits/translations already
 * write through to disk immediately — see LocaleTranslationService — so
 * this is only needed to regenerate the files on an environment that has
 * the DB but not the generated files yet, e.g. right after a fresh
 * deploy/clone and before `npm run build`.
 */
class ExportLocaleTranslationsCommand extends Command
{
    protected $signature = 'translations:export {locale? : Only export this locale code, e.g. th}';

    protected $description = 'Export the locale_translation_files DB table to resources/js/locales/{code}/*.json';

    public function handle(LocaleTranslationService $service): int
    {
        $service->exportToDisk($this->argument('locale'));

        $this->info('Done.');

        return Command::SUCCESS;
    }
}
