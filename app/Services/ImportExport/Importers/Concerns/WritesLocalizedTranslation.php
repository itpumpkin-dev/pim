<?php

namespace App\Services\ImportExport\Importers\Concerns;

use App\Jobs\AutoTranslateLabelsJob;
use App\Models\Locale;

/**
 * Shared by the RowImporters whose entity has a `{Entity}Translation` table
 * (Category, Attribute, AttributeFamily, AttributeOption) — all four are the
 * same shape (`{parent}_id, locale_id, label`, unique per pair), so the
 * import's chosen source locale is written into that table the same way for
 * each, instead of each importer only ever touching the raw fallback column.
 */
trait WritesLocalizedTranslation
{
    /**
     * The raw fallback column's established language, by this codebase's
     * long-standing convention (see ProductRowImporter::sourceLocaleId()'s
     * docblock) — deliberately not config('app.locale'), which is 'en' here
     * and unrelated to what language the raw column actually holds.
     */
    private const RAW_COLUMN_LOCALE = 'th';

    /**
     * What the raw fallback column should hold after this import: the new
     * label only if there was nothing there before (the column is NOT
     * NULL, so a brand-new record needs *something*) or the import's source
     * locale is the raw column's own established language; otherwise the
     * existing value is left untouched so a non-Thai import can't silently
     * clobber the fallback every other locale relies on.
     */
    private function resolveRawColumnValue(?string $existingRawValue, string $newLabel, string $sourceLocaleCode): string
    {
        $isNew = $existingRawValue === null || trim($existingRawValue) === '';

        return ($isNew || $sourceLocaleCode === self::RAW_COLUMN_LOCALE) ? $newLabel : $existingRawValue;
    }

    /**
     * Upserts the {Entity}Translation row for the import's chosen source
     * locale, and — when "AI translate" is on — fans it out to every other
     * enabled locale that doesn't already have one, via the same
     * AutoTranslateLabelsJob the manual admin forms use (see
     * CategoryController::autoTranslate()).
     *
     * Deliberately does NOT fall back to Thai when $sourceLocaleCode can't
     * be resolved (unlike resolveRawColumnValue(), which only ever compares
     * the literal code against RAW_COLUMN_LOCALE) — falling back here would
     * silently write into the real Thai translation row under an
     * unconfirmed locale, while resolveRawColumnValue() (called separately,
     * earlier) would still correctly treat that same unresolvable code as
     * "not Thai" and leave the raw column alone. An unresolvable code is a
     * no-op instead, so neither the raw column nor any translation row is
     * touched.
     *
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $translationModelClass
     * @return bool whether the translation row was actually created or its
     *              label changed — callers that only audit the raw column
     *              (which this may leave untouched) need this to know a
     *              real change happened.
     */
    private function writeLocalizedTranslation(
        string $translationModelClass,
        string $foreignKey,
        int $ownerId,
        string $label,
        string $sourceLocaleCode,
        bool $aiTranslate,
    ): bool {
        $sourceLocaleId = Locale::idForCode($sourceLocaleCode);
        if ($sourceLocaleId === null) {
            return false;
        }

        $existingTranslation = $translationModelClass::where($foreignKey, $ownerId)->where('locale_id', $sourceLocaleId)->first();
        $changed = ! $existingTranslation || $existingTranslation->label !== $label;

        $translationModelClass::updateOrCreate(
            [$foreignKey => $ownerId, 'locale_id' => $sourceLocaleId],
            ['label' => $label]
        );

        if ($aiTranslate) {
            AutoTranslateLabelsJob::dispatch($translationModelClass, $foreignKey, $ownerId, $sourceLocaleId, $label);
        }

        return $changed;
    }
}
