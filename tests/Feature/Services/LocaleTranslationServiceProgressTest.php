<?php

use App\Models\Locale;
use App\Models\LocaleTranslationFile;
use App\Models\TranslationProvider;
use App\Services\LocaleTranslationService;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;

/**
 * LocaleTranslationService::progress() — live coverage for the Locales list,
 * replacing the translation_total/translation_translated snapshot that the
 * last translate run left behind (and that never moved again afterwards).
 */
const LTS_PROGRESS_CODE = 'zz_progress_test';

afterEach(function () {
    File::deleteDirectory(resource_path('js/locales/' . LTS_PROGRESS_CODE));
});

function ltsProgressLocale(): Locale
{
    $locale = Locale::create(['code' => LTS_PROGRESS_CODE, 'enabled' => true]);
    app(LocaleTranslationService::class)->scaffoldLocale($locale);

    return $locale;
}

function ltsEnglish(string $namespace, string $key): string
{
    return json_decode(File::get(resource_path("js/locales/en/{$namespace}.json")), true)[$key];
}

test('a freshly scaffolded locale (English copies only) counts as 0% translated', function () {
    ltsProgressLocale();

    $progress = app(LocaleTranslationService::class)->progress(LTS_PROGRESS_CODE);

    expect($progress['total'])->toBeGreaterThan(0)
        ->and($progress['translated'])->toBe(0);
});

test('manual edits move the progress, and a value saved identical to English counts as translated', function () {
    ltsProgressLocale();
    $service = app(LocaleTranslationService::class);

    $service->updateNamespaceEntries(LTS_PROGRESS_CODE, 'system', ['save' => 'translated save']);
    expect($service->progress(LTS_PROGRESS_CODE)['translated'])->toBe(1);

    $service->updateNamespaceEntries(LTS_PROGRESS_CODE, 'system', ['cancel' => ltsEnglish('system', 'cancel')]);
    expect($service->progress(LTS_PROGRESS_CODE)['translated'])->toBe(2);

    // Changing a confirmed-identical key to something else drops it from identical_keys.
    $service->updateNamespaceEntries(LTS_PROGRESS_CODE, 'system', ['cancel' => 'translated cancel']);
    expect(LocaleTranslationFile::where('locale_code', LTS_PROGRESS_CODE)->where('namespace', 'system')->value('identical_keys'))
        ->not->toContain('cancel')
        ->and($service->progress(LTS_PROGRESS_CODE)['translated'])->toBe(2);
});

test('strings the provider returns unchanged are remembered and not resent on the next run', function () {
    $locale = ltsProgressLocale();
    TranslationProvider::query()->update(['is_default' => false]);
    TranslationProvider::create([
        'type' => 'libretranslate',
        'name' => 'Echo',
        'credentials' => ['url' => 'https://fake-translate.test/translate'],
        'enabled' => true,
        'is_default' => true,
    ]);
    // Echo every string back untouched, like an MT engine does for "SKU".
    Http::fake(['fake-translate.test/*' => fn ($request) => Http::response(['translatedText' => $request->data()['q']])]);

    $service = app(LocaleTranslationService::class);
    $service->translate($locale->id);

    $progress = $service->progress(LTS_PROGRESS_CODE);
    expect($progress['translated'])->toBe($progress['total'])
        ->and($locale->fresh()->translation_status)->toBe('completed');

    $sent = count(Http::recorded());
    $service->translate($locale->id);
    expect(count(Http::recorded()))->toBe($sent);
});

test('the locales list shows live progress instead of the stored snapshot', function () {
    $locale = ltsProgressLocale();
    $locale->update(['translation_status' => 'completed', 'translation_total' => 5, 'translation_translated' => 5]);
    $total = app(LocaleTranslationService::class)->progress(LTS_PROGRESS_CODE)['total'];

    (fn () => $this->applyLiveProgress($locale))->call(app(\App\Http\Controllers\System\LocaleController::class));

    expect($locale->translation_status)->toBe('not_started')
        ->and($locale->translation_total)->toBe($total)
        ->and($locale->translation_translated)->toBe(0)
        ->and($locale->fresh()->translation_total)->toBe(5);
});

test('a failed last run stays "failed" in the list even when some strings are translated', function () {
    $locale = ltsProgressLocale();
    app(LocaleTranslationService::class)->updateNamespaceEntries(LTS_PROGRESS_CODE, 'system', ['save' => 'translated save']);
    $locale->update(['translation_status' => 'failed']);

    (fn () => $this->applyLiveProgress($locale))->call(app(\App\Http\Controllers\System\LocaleController::class));

    expect($locale->translation_status)->toBe('failed')
        ->and($locale->translation_translated)->toBe(1);
});
