<?php

namespace App\Jobs;

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
    ) {
    }

    public function handle(AttributeAutoTranslator $translator): void
    {
        $translator->fillMissing(
            $this->translationModel,
            $this->foreignKey,
            $this->ownerId,
            $this->sourceLocaleId,
            $this->sourceLabel,
        );
    }
}
