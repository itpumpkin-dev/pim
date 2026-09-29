<?php

use App\Models\TranslationProvider;
use App\Services\LocaleTranslationService;
use Illuminate\Support\Facades\Http;

/**
 * Per-key "translate" button on the manual translations editor
 * (system/locale/translations.tsx) — LocaleTranslationService::translateEntry().
 */
function ltsFakeProvider(): void
{
    TranslationProvider::query()->update(['is_default' => false]);
    TranslationProvider::create([
        'type' => 'libretranslate',
        'name' => 'Fake',
        'credentials' => ['url' => 'https://fake-translate.test/translate'],
        'enabled' => true,
        'is_default' => true,
    ]);
}

test('translateEntry() translates one key\'s English source and restores {{placeholders}}', function () {
    ltsFakeProvider();
    Http::fake(['fake-translate.test/*' => Http::response(['translatedText' => ['xph0ph ยังไม่บันทึก']])]);

    $value = app(LocaleTranslationService::class)->translateEntry('th', 'system', 'unsavedTranslationsCount');

    expect($value)->toBe('{{count}} ยังไม่บันทึก');
    Http::assertSent(fn ($request) => str_contains(json_encode($request->data(), JSON_UNESCAPED_UNICODE), 'xph0ph unsaved'));
});

test('translateEntry() throws for an unknown key', function () {
    ltsFakeProvider();
    Http::fake();

    app(LocaleTranslationService::class)->translateEntry('th', 'system', 'noSuchKeyAnywhere');
})->throws(RuntimeException::class, 'Unknown translation key');

test('translateEntry() throws when no default provider is configured', function () {
    TranslationProvider::query()->update(['is_default' => false]);
    Http::fake();

    app(LocaleTranslationService::class)->translateEntry('th', 'system', 'translationValue');
})->throws(RuntimeException::class, 'No enabled default translation provider');
