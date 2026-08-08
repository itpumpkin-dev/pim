<?php

namespace App\Jobs;

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
    ) {
    }

    public function handle(AttributeAutoTranslator $translator): void
    {
        $translator->fillMissingJsonColumn(
            $this->modelClass,
            $this->ownerId,
            $this->column,
            $this->sourceLocaleId,
            $this->sourceLabel,
        );
    }
}
