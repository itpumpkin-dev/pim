<?php

namespace App\Jobs;

use App\Models\Category;
use App\Models\CategoryTranslation;
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

        // The controller already bumps the cached category tree (see
        // Category::bumpTreeCacheVersion()) when the save happens, but this
        // job fills in the *other* locales asynchronously after that — bump
        // again once it's done, or those labels stay stale in the cached
        // tree until the 6h TTL expires.
        if ($this->translationModel === CategoryTranslation::class) {
            Category::bumpTreeCacheVersion();
        }
    }
}
