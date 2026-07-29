<?php

namespace App\Services;

use App\Jobs\TranslateLocaleJob;
use App\Models\Locale;
use App\Models\LocaleTranslationFile;
use App\Models\TranslationProvider;
use App\Services\Translation\TranslationProviderRegistry;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

/**
 * DB-backed translation store for resources/js/locales/{code}/*.json.
 *
 * The `locale_translation_files` table (one row per locale+namespace, see
 * App\Models\LocaleTranslationFile) is the source of truth for every
 * non-English locale — English stays file-only (dev-authored, git-tracked;
 * see SOURCE_LOCALE) and is always read straight off disk.
 *
 * Every write to the DB store is immediately mirrored back out to the
 * physical *.json files so Vite's `import.meta.glob` (resources/js/lib/i18n.ts)
 * keeps working unchanged — the DB round-trip is invisible to the frontend.
 * `php artisan translations:export` re-runs that mirroring on demand (e.g.
 * after a fresh deploy/clone that only has the DB, not the generated files).
 */
class LocaleTranslationService
{
    private const SOURCE_LOCALE = 'en';

    /** LibreTranslate strings per request — keeps each call fast enough that one slow/rate-limited chunk doesn't sink the whole locale. */
    private const CHUNK_SIZE = 20;

    /**
     * Seeds the DB store for a newly added locale with the English fallback
     * so the UI is usable immediately, mirrors it out to disk, and records
     * how many strings it has to translate. Does not call out to any
     * translation service.
     */
    public function scaffoldLocale(Locale $locale): void
    {
        if ($locale->code === self::SOURCE_LOCALE) {
            return;
        }

        if (LocaleTranslationFile::where('locale_code', $locale->code)->exists()) {
            return;
        }

        $sourceStrings = $this->readSourceFiles();

        $this->writeTargetStrings($locale->code, $sourceStrings);

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

        if (! LocaleTranslationFile::where('locale_code', $locale->code)->exists()) {
            $this->scaffoldLocale($locale);
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

        if (! $locale || ! LocaleTranslationFile::where('locale_code', $locale->code)->exists()) {
            return;
        }

        $sourceStrings = $this->readSourceFiles();
        $targetStrings = $this->readTargetStrings($locale->code);

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

        $this->writeTargetStrings($locale->code, $translated);

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
     * Re-mirrors every (or one) DB-stored locale out to
     * resources/js/locales/{code}/*.json. Used by `artisan translations:export`
     * to rebuild the generated files from the DB alone (e.g. on a fresh
     * deploy/clone), independent of the write-through done by
     * scaffoldLocale()/translate().
     */
    public function exportToDisk(?string $code = null): void
    {
        $query = LocaleTranslationFile::query();

        if ($code !== null) {
            $query->where('locale_code', $code);
        }

        $byLocale = $query->get()->groupBy('locale_code');

        foreach ($byLocale as $localeCode => $rows) {
            $strings = [];
            foreach ($rows as $row) {
                $strings[$row->namespace . '.json'] = $row->content;
            }

            $this->writeFilesToDisk($localeCode, $strings);
        }
    }

    /**
     * English is dev-authored on disk and never has a DB row (see
     * SOURCE_LOCALE) — the manual translations editor has nothing to read
     * or write for it and must not be shown for this locale.
     */
    public function isSourceLocale(string $code): bool
    {
        return $code === self::SOURCE_LOCALE;
    }

    /**
     * Namespace names available for editing (derived from the English
     * source files — every locale is expected to cover the same set).
     *
     * @return array<int, string>
     */
    public function getNamespaces(): array
    {
        return array_map(
            fn (string $filename) => pathinfo($filename, PATHINFO_FILENAME),
            array_keys($this->readSourceFiles()),
        );
    }

    /**
     * Flattens one namespace into editable rows: every leaf key from the
     * English source, paired with the locale's current value (falls back to
     * the English text when nothing has been translated/edited yet).
     *
     * @return array<int, array{path: string, source: string, value: string}>
     */
    public function getNamespaceEntries(string $localeCode, string $namespace): array
    {
        $source = $this->readSourceFiles()[$namespace . '.json'] ?? [];
        $target = LocaleTranslationFile::where('locale_code', $localeCode)
            ->where('namespace', $namespace)
            ->value('content') ?? [];

        $entries = [];

        foreach ($this->flatten($source) as [$path, $sourceValue]) {
            $entries[] = [
                'path' => implode('.', $path),
                'source' => $sourceValue,
                'value' => $this->getNested($target, $path) ?? $sourceValue,
            ];
        }

        return $entries;
    }

    /**
     * Applies manual edits to one namespace: merges the given dot-path =>
     * value pairs into the locale's current content for that namespace,
     * then upserts + mirrors to disk exactly like an auto-translation run.
     *
     * @param array<string, string> $values dot-path => new value
     */
    public function updateNamespaceEntries(string $localeCode, string $namespace, array $values): void
    {
        $filename = $namespace . '.json';
        $content = LocaleTranslationFile::where('locale_code', $localeCode)
            ->where('namespace', $namespace)
            ->value('content') ?? $this->readSourceFiles()[$filename] ?? [];

        foreach ($values as $path => $value) {
            $this->setNested($content, explode('.', $path), $value);
        }

        $this->writeTargetStrings($localeCode, [$filename => $content]);
    }

    /**
     * @return array<string, array<string, mixed>> keyed by filename
     */
    private function readSourceFiles(): array
    {
        $dir = resource_path('js/locales/' . self::SOURCE_LOCALE);
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
     * @return array<string, array<string, mixed>> keyed by filename; empty for locales with no rows yet
     */
    private function readTargetStrings(string $code): array
    {
        $strings = [];

        foreach (LocaleTranslationFile::where('locale_code', $code)->get() as $row) {
            $strings[$row->namespace . '.json'] = $row->content;
        }

        return $strings;
    }

    /**
     * Upserts every namespace for a locale into the DB store, then mirrors
     * the same content out to disk so the Vite bundle sees it without a
     * separate export step.
     *
     * @param array<string, array<string, mixed>> $strings keyed by filename
     */
    private function writeTargetStrings(string $code, array $strings): void
    {
        foreach ($strings as $filename => $content) {
            LocaleTranslationFile::updateOrCreate(
                ['locale_code' => $code, 'namespace' => pathinfo($filename, PATHINFO_FILENAME)],
                ['content' => $content],
            );
        }

        $this->writeFilesToDisk($code, $strings);
    }

    /**
     * @param array<string, array<string, mixed>> $strings keyed by filename
     */
    private function writeFilesToDisk(string $code, array $strings): void
    {
        $targetDir = resource_path('js/locales/' . $code);

        if (! File::isDirectory($targetDir)) {
            File::makeDirectory($targetDir, 0755, true);
        }

        foreach ($strings as $filename => $content) {
            File::put($targetDir . '/' . $filename, $this->encode($content));
        }
    }

    /**
     * @param array<string, array<string, mixed>> $sourceStrings keyed by filename, then by (possibly nested) translation key
     * @param array<string, array<string, mixed>> $targetStrings the locale's current DB content, kept as-is wherever it already differs from source
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
