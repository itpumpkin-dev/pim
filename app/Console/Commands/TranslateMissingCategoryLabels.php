<?php

namespace App\Console\Commands;

use App\Jobs\AutoTranslateLabelsJob;
use App\Models\Category;
use App\Models\CategoryTranslation;
use App\Models\JobTracker;
use App\Models\Locale;
use Illuminate\Console\Command;

/**
 * One-time backfill: queues an AutoTranslateLabelsJob for every category
 * using whatever translation it already has as the source, so categories
 * created before "AI translate" existed (or with it left off) still get
 * their missing locales filled in. Ignores each category's own
 * `is_ai_translate` flag on purpose — that flag only gates the automatic
 * translate-on-save behavior, not this explicit, user-requested run.
 * AutoTranslateLabelsJob/AttributeAutoTranslator already skip any locale
 * that already has a translation, so queuing it for every category
 * (including ones already fully translated) is safe — those just no-op.
 */
class TranslateMissingCategoryLabels extends Command
{
    protected $signature = 'app:translate-missing-category-labels';

    protected $description = 'Queue AI translation for every category missing a translation in one of the active locales';

    public function handle(): int
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));

        $dispatched = 0;
        $skipped = 0;

        $tracker = JobTracker::openTranslation('categories', 'console:translate-missing-category-labels', null);

        Category::query()
            ->with('translations')
            ->orderBy('id')
            ->chunk(200, function ($categories) use ($defaultLocaleId, $tracker, &$dispatched, &$skipped) {
                foreach ($categories as $category) {
                    $translations = $category->translations
                        ->mapWithKeys(fn (CategoryTranslation $t) => [(string) $t->locale_id => $t->label])
                        ->all();

                    [$sourceLocaleId, $sourceLabel] = $this->resolveSource($translations, $defaultLocaleId);

                    if ($sourceLocaleId === null || $sourceLabel === '') {
                        $skipped++;
                        continue;
                    }

                    $tracker->noteTranslationQueued();
                    AutoTranslateLabelsJob::dispatch(
                        CategoryTranslation::class,
                        'category_id',
                        $category->id,
                        $sourceLocaleId,
                        $sourceLabel,
                        $tracker->id,
                    );
                    $dispatched++;
                }
            });

        if ($dispatched === 0) {
            $tracker->update(['status' => 'completed', 'completed_at' => now()]);
        }

        $this->info("Queued {$dispatched} categories for translation; skipped {$skipped} with no label in any locale.");

        return self::SUCCESS;
    }

    /**
     * Same priority as CategoryController::resolveAutoTranslateSource() —
     * prefer the app's default locale, fall back to whichever locale
     * actually has a label.
     *
     * @param  array<string, string>  $translations
     * @return array{0: int|null, 1: string}
     */
    private function resolveSource(array $translations, ?int $defaultLocaleId): array
    {
        $defaultLabel = trim((string) ($translations[(string) $defaultLocaleId] ?? ''));

        if ($defaultLocaleId !== null && $defaultLabel !== '') {
            return [$defaultLocaleId, $defaultLabel];
        }

        foreach ($translations as $localeId => $label) {
            $label = trim((string) $label);
            if ($label !== '') {
                return [(int) $localeId, $label];
            }
        }

        return [null, ''];
    }
}
