<?php

namespace App\Jobs;

use App\Models\Locale;
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

    public function __construct(public int $localeId)
    {
    }

    public function handle(LocaleTranslationService $localeTranslationService): void
    {
        $localeTranslationService->translate($this->localeId);
    }

    public function failed(\Throwable $exception): void
    {
        Locale::whereKey($this->localeId)->update([
            'translation_status' => 'failed',
            'translation_completed_at' => now(),
        ]);
    }
}
