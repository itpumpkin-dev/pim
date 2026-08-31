<?php

namespace App\Jobs;

use App\Models\Category;
use App\Models\CategoryTranslation;
use App\Models\JobTracker;
use App\Services\AttributeAutoTranslator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Queued wrapper around AttributeAutoTranslator::fillMissing() — moves the
 * per-locale translation-provider calls off the request/response cycle, so
 * saving an attribute/option with "AI translate" on doesn't sit there
 * waiting on the provider for every missing locale.
 */
class AutoTranslateLabelsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public int $timeout = 120;

    /**
     * @param class-string<\Illuminate\Database\Eloquent\Model> $translationModel
     */
    public function __construct(
        public string $translationModel,
        public string $foreignKey,
        public int $ownerId,
        public int $sourceLocaleId,
        public string $sourceLabel,
        // Standalone translation tracker row (JobTracker::openTranslation),
        // when this was dispatched from a save / bulk "translate missing"
        // action so the Locales page's "Translation Jobs" tab can show live
        // progress. Null for callers with no tracker (e.g. an import, which
        // reports onto its own import tracker instead).
        public ?int $jobTrackerId = null,
    ) {
    }

    public function handle(AttributeAutoTranslator $translator): void
    {
        $cancelled = $this->jobTrackerId
            && JobTracker::where('id', $this->jobTrackerId)->whereNotNull('cancel_requested_at')->exists();

        if (! $cancelled) {
            $translator->fillMissing(
                $this->translationModel,
                $this->foreignKey,
                $this->ownerId,
                $this->sourceLocaleId,
                $this->sourceLabel,
            );
        }

        if ($this->jobTrackerId) {
            JobTracker::find($this->jobTrackerId)?->noteTranslationDone();
        }

        // The controller already bumps the cached category tree (see
        // Category::bumpTreeCacheVersion()) when the save happens, but this
        // job fills in the *other* locales asynchronously after that — bump
        // again once it's done, or those labels stay stale in the cached
        // tree until the 6h TTL expires.
        if ($this->translationModel === CategoryTranslation::class) {
            Category::bumpTreeCacheVersion();
        }
    }

    /**
     * A job that exhausts every try (provider outage, bad payload, …) still
     * has to report back, or its tracker's completed counter never catches
     * up to queued and the "Translation Jobs" tab shows it running forever.
     */
    public function failed(\Throwable $e): void
    {
        if ($this->jobTrackerId) {
            JobTracker::find($this->jobTrackerId)?->noteTranslationDone($e->getMessage());
        }
    }
}
