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
 * Queued wrapper around AttributeAutoTranslator::fillMissingJsonColumn() — the
 * JSON-column counterpart to AutoTranslateLabelsJob, for models (e.g.
 * CategoryField) that store every locale's label inline in a single column
 * instead of one row per locale in a related translations table.
 */
class AutoTranslateJsonLabelsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public int $timeout = 120;

    /**
     * @param class-string<\Illuminate\Database\Eloquent\Model> $modelClass
     */
    public function __construct(
        public string $modelClass,
        public int $ownerId,
        public string $column,
        public int $sourceLocaleId,
        public string $sourceLabel,
        // See AutoTranslateLabelsJob::$jobTrackerId.
        public ?int $jobTrackerId = null,
    ) {
    }

    public function handle(AttributeAutoTranslator $translator): void
    {
        $cancelled = $this->jobTrackerId
            && JobTracker::where('id', $this->jobTrackerId)->whereNotNull('cancel_requested_at')->exists();

        if (! $cancelled) {
            $translator->fillMissingJsonColumn(
                $this->modelClass,
                $this->ownerId,
                $this->column,
                $this->sourceLocaleId,
                $this->sourceLabel,
            );
        }

        if ($this->jobTrackerId) {
            JobTracker::find($this->jobTrackerId)?->noteTranslationDone();
        }
    }

    public function failed(\Throwable $e): void
    {
        if ($this->jobTrackerId) {
            JobTracker::find($this->jobTrackerId)?->noteTranslationDone($e->getMessage());
        }
    }
}
