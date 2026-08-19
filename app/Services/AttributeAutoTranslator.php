<?php

namespace App\Services;

use App\Models\Locale;
use App\Models\ProductValue;
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
            return $translationModel::where($foreignKey, $ownerId)->pluck('label', 'locale_id')->all();
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
                ->mapWithKeys(fn ($label, $id) => [(int) $id => $label])
                ->all();
        }, function (string $label, Locale $locale) use (&$labels) {
            $labels[(string) $locale->id] = $label;
        }, ['model' => $modelClass, 'owner_id' => $ownerId, 'column' => $column]);

        $model->update([$column => $labels]);
    }

    /**
     * Same pre-fill behavior again, but for a product's locale-based
     * attribute value (ProductValue), which — unlike the translations
     * tables fillMissing() targets — is keyed by (product_id, attribute_id,
     * channel_id, locale_id) rather than a single foreign key. Only ever
     * touches the channel_id = null (Default/All Channels) scope, matching
     * where an import lands a locale-based column's value in the first
     * place (see ProductRowImporter::importRow()).
     *
     * Passes retranslateIdenticalCopies: true — a lot of this catalog's
     * products already carry pre-existing per-locale rows that are just a
     * verbatim copy of the Thai source (leftover from an earlier import/seed
     * that never actually translated anything), not a real translation.
     * Treating those as "already covered" (fillMissing()'s normal behavior)
     * would silently skip them forever — every "AI translate" import would
     * report success while never actually translating a single one.
     */
    public function fillMissingProductValue(int $productId, int $attributeId, int $sourceLocaleId, string $sourceValue): void
    {
        $this->translateMissing($sourceLocaleId, $sourceValue, function () use ($productId, $attributeId) {
            return ProductValue::where('product_id', $productId)
                ->where('attribute_id', $attributeId)
                ->whereNull('channel_id')
                ->whereNotNull('locale_id')
                ->pluck('value', 'locale_id')
                ->all();
        }, function (string $value, Locale $locale) use ($productId, $attributeId) {
            ProductValue::updateOrCreate(
                ['product_id' => $productId, 'attribute_id' => $attributeId, 'channel_id' => null, 'locale_id' => $locale->id],
                ['value' => $value]
            );
        }, ['model' => ProductValue::class, 'product_id' => $productId, 'attribute_id' => $attributeId], retranslateIdenticalCopies: true);
    }

    /**
     * Shared translate-every-missing-locale loop: resolves the provider and
     * source locale once, then calls $save for each locale not already
     * covered by $existingValuesByLocale() — the callers differ only in how
     * they read/write the target labels (related rows, a JSON column, or
     * ProductValue rows).
     *
     * $retranslateIdenticalCopies additionally targets a locale whose
     * existing value is a byte-for-byte copy of $sourceLabel — a real
     * translation into a different language essentially never equals the
     * source text verbatim, so that's a reliable "this was never actually
     * translated" signal, not a coincidence. Off by default (false) so
     * fillMissing()/fillMissingJsonColumn() keep their original "never
     * touch an existing row" guarantee for hand-typed labels.
     *
     * @param callable(): array<int, string> $existingValuesByLocale locale_id => current value
     * @param callable(string, Locale): void $save
     */
    private function translateMissing(int $sourceLocaleId, string $sourceLabel, callable $existingValuesByLocale, callable $save, array $logContext, bool $retranslateIdenticalCopies = false): void
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

        $existingValues = $existingValuesByLocale();

        $targetLocales = Locale::active()->filter(function ($locale) use ($sourceLocale, $existingValues, $sourceLabel, $retranslateIdenticalCopies) {
            if ($locale->id === $sourceLocale->id) {
                return false;
            }
            if (!array_key_exists($locale->id, $existingValues)) {
                return true;
            }

            return $retranslateIdenticalCopies && trim((string) $existingValues[$locale->id]) === $sourceLabel;
        });

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
