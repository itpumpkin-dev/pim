<?php

namespace App\Jobs;

use App\Models\Locale;
use App\Services\AppNotifier;
use App\Services\LocaleTranslationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class TranslateLocaleJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;

    public int $timeout = 300;

    public function __construct(public int $localeId, public ?int $userId = null)
    {
    }

    public function handle(LocaleTranslationService $localeTranslationService): void
    {
        $localeTranslationService->translate($this->localeId);

        $locale = Locale::find($this->localeId);
        if (! $locale) {
            return;
        }

        // LocaleTranslationService::translate() itself already set this to
        // completed/partial/failed right before returning — read it back
        // instead of duplicating that success/failure logic here.
        AppNotifier::notify(
            $this->userId,
            "Translation: {$locale->code}",
            match ($locale->translation_status) {
                'completed' => 'Finished translating '.$locale->translation_translated.' string(s).',
                'partial' => 'Partially translated '.$locale->translation_translated.' of '.$locale->translation_total.' string(s).',
                default => 'Translation failed — no strings were translated.',
            },
            $locale->translation_status === 'failed' ? 'failed' : 'success',
            '/system/locales'
        );
    }

    public function failed(\Throwable $exception): void
    {
        Locale::whereKey($this->localeId)->update([
            'translation_status' => 'failed',
            'translation_completed_at' => now(),
        ]);

        $locale = Locale::find($this->localeId);
        AppNotifier::notify(
            $this->userId,
            'Translation: '.($locale?->code ?? $this->localeId),
            "Job failed: {$exception->getMessage()}",
            'failed',
            '/system/locales'
        );
    }
}
