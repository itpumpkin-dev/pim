<?php

namespace App\Jobs;

use App\Models\JobTracker;
use App\Services\AttributeAutoTranslator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Queued wrapper around AttributeAutoTranslator::fillMissingProductValue() —
 * same reasoning as AutoTranslateLabelsJob: a provider call per missing
 * locale is too slow to make an import row (or a product save) wait on.
 */
class AutoTranslateProductValueJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public int $timeout = 120;

    public function __construct(
        public int $productId,
        public int $attributeId,
        public int $sourceLocaleId,
        public string $sourceValue,
        // The import's JobTracker row, when this was dispatched from a
        // products import with "AI translate" on — lets the job status page
        // show live "X of Y translated" progress instead of these running
        // with no visibility at all. Null for any other caller (e.g. a
        // future non-import trigger) that has no such tracker to report to.
        public ?int $jobTrackerId = null,
    ) {
    }

    public function handle(AttributeAutoTranslator $translator): void
    {
        // Re-fetched fresh rather than trusting a stale in-memory tracker —
        // same reasoning as ProcessImportJob's own cancel check: the cancel
        // request lands via a separate web request/process. Skips the actual
        // provider call (the expensive/costly part) once cancelled, but still
        // counts as "completed" below so the job status page's progress bar
        // reaches 100% instead of hanging on a translation that will never run.
        $cancelled = $this->jobTrackerId
            && JobTracker::where('id', $this->jobTrackerId)->whereNotNull('cancel_requested_at')->exists();

        if (!$cancelled) {
            $translator->fillMissingProductValue(
                $this->productId,
                $this->attributeId,
                $this->sourceLocaleId,
                $this->sourceValue,
            );
        }

        if ($this->jobTrackerId) {
            JobTracker::where('id', $this->jobTrackerId)->increment('total_translations_completed');
        }
    }

    /**
     * Without this, a job that exhausts both tries (provider outage, a
     * malformed value, ...) never increments total_translations_completed —
     * the job status page's translationsPending check
     * (resources/js/pages/import-export/jobs/show.tsx) would then never see
     * completed catch up to queued, and poll every 2s forever showing
     * "Translating" for work that's actually dead.
     */
    public function failed(): void
    {
        if ($this->jobTrackerId) {
            JobTracker::where('id', $this->jobTrackerId)->increment('total_translations_completed');
        }
    }
}
