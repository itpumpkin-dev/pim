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

        $existingLocaleIds = $translationModel::where($foreignKey, $ownerId)->pluck('locale_id')->all();

        $targetLocales = Locale::active()->filter(
            fn ($locale) => $locale->id !== $sourceLocale->id && !in_array($locale->id, $existingLocaleIds, true)
        );

        foreach ($targetLocales as $locale) {
            try {
                $translated = TranslationProviderRegistry::resolve($provider->type)
                    ->translateBatch([$sourceLabel], $sourceLocale->code, $locale->code, $provider->credentials ?? []);

                $label = trim($translated[0] ?? '');
                if ($label === '') {
                    continue;
                }

                $translationModel::updateOrCreate(
                    [$foreignKey => $ownerId, 'locale_id' => $locale->id],
                    ['label' => $label]
                );
            } catch (\Throwable $e) {
                Log::warning('Attribute auto-translation failed for one locale, skipping.', [
                    'model' => $translationModel,
                    'owner_id' => $ownerId,
                    'locale' => $locale->code,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
