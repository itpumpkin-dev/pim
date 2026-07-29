<?php

namespace App\Services;

use App\Jobs\TranslateLocaleJob;
use App\Models\Locale;
use App\Models\TranslationProvider;
use App\Services\Translation\TranslationProviderRegistry;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

/**
 * Scaffolds resources/js/locales/{code}/*.json for a newly added locale by
 * copying the English source files (fast, synchronous, no network), and
 * separately machine-translates the values via whichever TranslationProvider
 * is currently marked default/enabled (see App\Services\Translation) on
 * demand. Translation is queued rather than run inline: the free public
 * LibreTranslate mirrors this points at by default can take well over a
 * request's lifetime to answer a ~150-string batch, and admins trigger it
 * explicitly from the locales list rather than it firing on every save.
 */
class LocaleTranslationService
{
    private const SOURCE_LOCALE = 'en';

    /** LibreTranslate strings per request — keeps each call fast enough that one slow/rate-limited chunk doesn't sink the whole locale. */
    private const CHUNK_SIZE = 20;

    /**
     * Writes the English fallback files for a new locale so the UI is usable
     * immediately, and records how many strings it has to translate. Does
     * not call out to any translation service.
     */
    public function scaffoldFolder(Locale $locale): void
    {
        if ($locale->code === self::SOURCE_LOCALE) {
            return;
        }

        $targetDir = resource_path('js/locales/' . $locale->code);

        if (File::isDirectory($targetDir)) {
            return;
        }

        File::makeDirectory($targetDir, 0755, true);

        $sourceStrings = $this->readSourceFiles();

        foreach ($sourceStrings as $filename => $strings) {
            File::put($targetDir . '/' . $filename, $this->encode($strings));
        }

        $total = 0;
        foreach ($sourceStrings as $strings) {
            $total += count($this->flatten($strings));
        }

        $locale->update([
            'translation_status' => 'not_started',
            'translation_total' => $total,
            'translation_translated' => 0,
            'translation_completed_at' => null,
        ]);
    }

    /**
     * Queues a (re)translation run. Safe to call repeatedly — e.g. to retry
     * a partial run, or to pick up strings added to the English source since
     * the locale was created. Only re-sends strings that still match the
     * English source (i.e. were never successfully translated) — strings
     * from a previous run are left untouched rather than re-translated.
     */
    public function queueTranslation(Locale $locale): void
    {
        if ($locale->code === self::SOURCE_LOCALE) {
            return;
        }

        if (! File::isDirectory(resource_path('js/locales/' . $locale->code))) {
            $this->scaffoldFolder($locale);
        }

        $locale->update([
            'translation_status' => 'queued',
            'translation_started_at' => now(),
            'translation_completed_at' => null,
        ]);

        TranslateLocaleJob::dispatch($locale->id);
    }

    /**
     * Runs the actual translation and updates the locale's progress as it
     * goes. Called from the queued job. Resumable: strings already
     * translated in a prior run are kept as-is and not re-sent.
     */
    public function translate(int $localeId): void
    {
        $locale = Locale::find($localeId);

        if (! $locale || ! File::isDirectory(resource_path('js/locales/' . $locale->code))) {
            return;
        }

        $sourceStrings = $this->readSourceFiles();
        $targetStrings = $this->readTargetFiles($locale->code);

        $total = 0;
        foreach ($sourceStrings as $strings) {
            $total += count($this->flatten($strings));
        }

        $locale->update([
            'translation_status' => 'translating',
            'translation_total' => $total,
        ]);

        $provider = TranslationProvider::where('enabled', true)->where('is_default', true)->first();

        $translatedCount = 0;
        $translated = $this->translateAll(
            $sourceStrings,
            $targetStrings,
            $locale->code,
            $provider,
            function (int $newlyTranslated) use ($locale, &$translatedCount) {
                $translatedCount += $newlyTranslated;
                $locale->update(['translation_translated' => $translatedCount]);
            },
        );

        $targetDir = resource_path('js/locales/' . $locale->code);
        foreach ($translated as $filename => $strings) {
            File::put($targetDir . '/' . $filename, $this->encode($strings));
        }

        $locale->update([
            'translation_status' => match (true) {
                $translatedCount === 0 => 'failed',
                $translatedCount >= $total => 'completed',
                default => 'partial',
            },
            'translation_completed_at' => now(),
        ]);
    }

    /**
     * @return array<string, array<string, mixed>> keyed by filename
     */
    private function readSourceFiles(): array
    {
        return $this->readLocaleFiles(self::SOURCE_LOCALE);
    }

    /**
     * @return array<string, array<string, mixed>> keyed by filename; empty for files that don't exist yet for this locale
     */
    private function readTargetFiles(string $code): array
    {
        return $this->readLocaleFiles($code);
    }

    /**
     * @return array<string, array<string, mixed>> keyed by filename
     */
    private function readLocaleFiles(string $code): array
    {
        $dir = resource_path('js/locales/' . $code);
        $strings = [];

        if (! File::isDirectory($dir)) {
            return $strings;
        }

        foreach (File::files($dir) as $file) {
            $strings[$file->getFilename()] = json_decode(File::get($file->getPathname()), true) ?? [];
        }

        return $strings;
    }

    /**
     * @param array<string, array<string, mixed>> $sourceStrings keyed by filename, then by (possibly nested) translation key
     * @param array<string, array<string, mixed>> $targetStrings the locale's current on-disk content, kept as-is wherever it already differs from source
     * @param callable(int): void $onChunkTranslated called with the number of *newly* translated strings after each successful chunk
     * @return array<string, array<string, mixed>>
     */
    private function translateAll(array $sourceStrings, array $targetStrings, string $target, ?TranslationProvider $provider, callable $onChunkTranslated): array
    {
        // Flatten every value across every file (files can nest objects, e.g.
        // grid.json's "fields"). Anything whose current target value already
        // differs from English is treated as already translated (by a prior
        // run, or by hand) and is left untouched — only strings still on
        // their English fallback get sent to the translator, in small
        // chunks so one slow/rate-limited chunk doesn't sink the whole run.
        $flatKeys = [];
        $flatValues = [];
        $flatPlaceholders = [];

        $result = $sourceStrings;
        $alreadyTranslated = 0;

        foreach ($sourceStrings as $filename => $strings) {
            foreach ($this->flatten($strings) as [$path, $sourceValue]) {
                $existing = $this->getNested($targetStrings[$filename] ?? [], $path);

                if ($existing !== null && $existing !== $sourceValue) {
                    $this->setNested($result[$filename], $path, $existing);
                    $alreadyTranslated++;

                    continue;
                }

                [$protected, $placeholders] = $this->protectPlaceholders($sourceValue);
                $flatKeys[] = [$filename, $path];
                $flatValues[] = $protected;
                $flatPlaceholders[] = $placeholders;
            }
        }

        if ($alreadyTranslated > 0) {
            $onChunkTranslated($alreadyTranslated);
        }

        foreach (array_chunk(array_keys($flatValues), self::CHUNK_SIZE) as $indices) {
            $chunkValues = array_map(fn (int $i) => $flatValues[$i], $indices);
            $translatedChunk = $this->translateChunk($chunkValues, $target, $provider);

            if ($translatedChunk === null) {
                continue;
            }

            foreach ($indices as $position => $i) {
                [$filename, $path] = $flatKeys[$i];
                $value = $this->restorePlaceholders($translatedChunk[$position], $flatPlaceholders[$i]);
                $this->setNested($result[$filename], $path, $value);
            }

            $onChunkTranslated(count($indices));
        }

        return $result;
    }

    /**
     * @param array<int, string> $values
     * @return array<int, string>|null null on failure, leaving those strings on their English fallback
     */
    private function translateChunk(array $values, string $target, ?TranslationProvider $provider): ?array
    {
        if (! $provider) {
            Log::warning('Locale auto-translation skipped: no enabled default translation provider is configured.', [
                'target' => $target,
            ]);

            return null;
        }

        try {
            $translated = TranslationProviderRegistry::resolve($provider->type)
                ->translateBatch($values, self::SOURCE_LOCALE, $target, $provider->credentials ?? []);

            if (count($translated) !== count($values)) {
                throw new \RuntimeException('Translation provider returned an unexpected response shape.');
            }

            return $translated;
        } catch (\Throwable $e) {
            Log::warning('Locale auto-translation chunk failed, keeping English fallback for these strings.', [
                'provider' => $provider->type,
                'target' => $target,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * Recursively walks a (possibly nested) translation array, yielding
     * [path, value] pairs where path is the list of keys leading to each
     * leaf string.
     *
     * @return array<int, array{0: array<int, string>, 1: string}>
     */
    private function flatten(array $data, array $path = []): array
    {
        $entries = [];

        foreach ($data as $key => $value) {
            $currentPath = [...$path, $key];

            if (is_array($value)) {
                array_push($entries, ...$this->flatten($value, $currentPath));
            } else {
                $entries[] = [$currentPath, (string) $value];
            }
        }

        return $entries;
    }

    /**
     * @param array<int, string> $path
     */
    private function getNested(array $data, array $path): ?string
    {
        $cursor = $data;

        foreach ($path as $key) {
            if (! is_array($cursor) || ! array_key_exists($key, $cursor)) {
                return null;
            }

            $cursor = $cursor[$key];
        }

        return is_string($cursor) ? $cursor : null;
    }

    /**
     * @param array<int, string> $path
     */
    private function setNested(array &$data, array $path, string $value): void
    {
        $cursor = &$data;

        foreach ($path as $i => $key) {
            if ($i === count($path) - 1) {
                $cursor[$key] = $value;
                break;
            }

            if (! isset($cursor[$key]) || ! is_array($cursor[$key])) {
                $cursor[$key] = [];
            }

            $cursor = &$cursor[$key];
        }
    }

    /**
     * Swaps i18next interpolation tokens like "{{count}}" for plain alphanumeric
     * markers before sending text to the translation API, since MT engines
     * routinely mangle or translate the words inside "{{ }}". Returns the
     * protected string plus a token => original map to restore afterward.
     *
     * @return array{0: string, 1: array<string, string>}
     */
    private function protectPlaceholders(string $value): array
    {
        $placeholders = [];

        $protected = preg_replace_callback('/\{\{\s*[\w.]+\s*\}\}/', function (array $match) use (&$placeholders) {
            $token = 'xph' . count($placeholders) . 'ph';
            $placeholders[$token] = $match[0];

            return $token;
        }, $value) ?? $value;

        return [$protected, $placeholders];
    }

    private function restorePlaceholders(string $value, array $placeholders): string
    {
        return strtr($value, $placeholders);
    }

    private function encode(array $strings): string
    {
        return json_encode($strings, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    }
}
