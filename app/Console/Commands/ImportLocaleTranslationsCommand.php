<?php

namespace App\Console\Commands;

use App\Models\LocaleTranslationFile;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * One-way sync of resources/js/locales/{code}/*.json into the DB store
 * (locale_translation_files). Used for the initial migration off
 * file-only storage, and afterwards only if files and DB ever drift —
 * normal admin edits/translations already write through both, see
 * App\Services\LocaleTranslationService.
 */
class ImportLocaleTranslationsCommand extends Command
{
    protected $signature = 'translations:import {locale? : Only import this locale code, e.g. th}';

    protected $description = 'Import resources/js/locales/{code}/*.json files into the locale_translation_files DB table';

    private const SOURCE_LOCALE = 'en';

    public function handle(): int
    {
        $localesDir = resource_path('js/locales');

        if (! File::isDirectory($localesDir)) {
            $this->error("No locales directory found at {$localesDir}.");

            return Command::FAILURE;
        }

        $only = $this->argument('locale');
        $imported = 0;

        foreach (File::directories($localesDir) as $dir) {
            $code = basename($dir);

            if ($code === self::SOURCE_LOCALE) {
                continue;
            }

            if ($only !== null && $code !== $only) {
                continue;
            }

            foreach (File::files($dir) as $file) {
                $content = json_decode(File::get($file->getPathname()), true);

                if (! is_array($content)) {
                    $this->warn("Skipping {$file->getPathname()}: not valid JSON.");

                    continue;
                }

                LocaleTranslationFile::updateOrCreate(
                    ['locale_code' => $code, 'namespace' => $file->getFilenameWithoutExtension()],
                    ['content' => $content],
                );

                $imported++;
            }

            $this->info("Imported {$code}.");
        }

        $this->info("Done. {$imported} namespace file(s) imported.");

        return Command::SUCCESS;
    }
}
