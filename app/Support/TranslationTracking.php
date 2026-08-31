<?php

namespace App\Support;

use App\Jobs\AutoTranslateJsonLabelsJob;
use App\Jobs\AutoTranslateLabelsJob;
use App\Models\JobTracker;

/**
 * Thin wrapper that pairs an auto-translation dispatch with its own
 * JobTracker row (job_type = 'translation'), so standalone translations —
 * the ones fired when someone saves an attribute/category/… with "AI
 * translate" on — show up on the Locales page's "Translation Jobs" tab
 * with live progress. Imports don't use this: they report onto the running
 * import's own tracker instead.
 */
class TranslationTracking
{
    /**
     * @param class-string<\Illuminate\Database\Eloquent\Model> $translationModel
     */
    public static function dispatchLabels(
        string $translationModel,
        string $foreignKey,
        int $ownerId,
        int $sourceLocaleId,
        string $sourceLabel,
        string $entityType,
        string $configCode,
        ?int $userId,
    ): void {
        $tracker = JobTracker::openTranslation($entityType, $configCode, $userId);
        $tracker->noteTranslationQueued();

        AutoTranslateLabelsJob::dispatch(
            $translationModel,
            $foreignKey,
            $ownerId,
            $sourceLocaleId,
            $sourceLabel,
            $tracker->id,
        );
    }

    /**
     * @param class-string<\Illuminate\Database\Eloquent\Model> $modelClass
     */
    public static function dispatchJsonLabels(
        string $modelClass,
        int $ownerId,
        string $column,
        int $sourceLocaleId,
        string $sourceLabel,
        string $entityType,
        string $configCode,
        ?int $userId,
    ): void {
        $tracker = JobTracker::openTranslation($entityType, $configCode, $userId);
        $tracker->noteTranslationQueued();

        AutoTranslateJsonLabelsJob::dispatch(
            $modelClass,
            $ownerId,
            $column,
            $sourceLocaleId,
            $sourceLabel,
            $tracker->id,
        );
    }
}
