<?php

namespace App\Services;

use App\Models\Locale;
use App\Models\TranslationProvider;
use App\Services\Translation\TranslationProviderRegistry;
use Illuminate\Support\Facades\Log;

/**
 * Pre-fills empty-locale translation rows for a freshly entered attribute/option
 * label, using the enabled default TranslationProvider. Only touches locales that
 * don't already have a row for this owner — never overwrites a label someone
 * typed by hand or that a prior run already produced. Called from
 * AutoTranslateLabelsJob (queued), not directly from a request — a handful of
 * provider calls, one per missing locale, is too slow to make Save wait on.
 */
class AttributeAutoTranslator
{
    /**
     * @param class-string<\Illuminate\Database\Eloquent\Model> $translationModel
     */
    public function fillMissing(string $translationModel, string $foreignKey, int $ownerId, int $sourceLocaleId, string $sourceLabel): void
    {
        $this->translateMissing($sourceLocaleId, $sourceLabel, function () use ($translationModel, $foreignKey, $ownerId) {
            return $translationModel::where($foreignKey, $ownerId)->pluck('locale_id')->all();
        }, function (string $label, Locale $locale) use ($translationModel, $foreignKey, $ownerId) {
            $translationModel::updateOrCreate(
                [$foreignKey => $ownerId, 'locale_id' => $locale->id],
                ['label' => $label]
            );
        }, ['model' => $translationModel, 'owner_id' => $ownerId]);
    }

    /**
     * Same pre-fill behavior as fillMissing(), but for models that store every
     * locale's label inline as a `{localeId: label}` JSON column (CategoryField's
     * `labels`) instead of one row per locale in a related translations table.
     *
     * @param class-string<\Illuminate\Database\Eloquent\Model> $modelClass
     */
    public function fillMissingJsonColumn(string $modelClass, int $ownerId, string $column, int $sourceLocaleId, string $sourceLabel): void
    {
        $model = $modelClass::find($ownerId);
        if (!$model) {
            return;
        }

        $labels = (array) ($model->{$column} ?? []);

        $this->translateMissing($sourceLocaleId, $sourceLabel, function () use ($labels) {
            return collect($labels)
                ->filter(fn ($label) => is_string($label) && trim($label) !== '')
                ->keys()
                ->map(fn ($id) => (int) $id)
                ->all();
        }, function (string $label, Locale $locale) use (&$labels) {
            $labels[(string) $locale->id] = $label;
        }, ['model' => $modelClass, 'owner_id' => $ownerId, 'column' => $column]);

        $model->update([$column => $labels]);
    }

    /**
     * Shared translate-every-missing-locale loop: resolves the provider and
     * source locale once, then calls $save for each locale not already
     * covered by $existingLocaleIds() — the two callers differ only in how
     * they read/write the target labels (related rows vs. a JSON column).
     *
     * @param callable(): int[] $existingLocaleIds
     * @param callable(string, Locale): void $save
     */
    private function translateMissing(int $sourceLocaleId, string $sourceLabel, callable $existingLocaleIds, callable $save, array $logContext): void
    {
        $sourceLabel = trim($sourceLabel);
        if ($sourceLabel === '') {
            return;
        }

        $provider = TranslationProvider::where('enabled', true)->where('is_default', true)->first();
        if (!$provider) {
            return;
        }

        $sourceLocale = Locale::find($sourceLocaleId);
        if (!$sourceLocale) {
            return;
        }

        $existingIds = $existingLocaleIds();

        $targetLocales = Locale::active()->filter(
            fn ($locale) => $locale->id !== $sourceLocale->id && !in_array($locale->id, $existingIds, true)
        );

        foreach ($targetLocales as $locale) {
            try {
                $translated = TranslationProviderRegistry::resolve($provider->type)
                    ->translateBatch([$sourceLabel], $sourceLocale->code, $locale->code, $provider->credentials ?? []);

                $label = trim($translated[0] ?? '');
                if ($label === '') {
                    continue;
                }

                $save($label, $locale);
            } catch (\Throwable $e) {
                Log::warning('Auto-translation failed for one locale, skipping.', [
                    ...$logContext,
                    'locale' => $locale->code,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
