<?php

use App\Models\LocaleTranslationFile;
use App\Services\LocaleTranslationService;
use Illuminate\Support\Facades\File;

/**
 * Bug: resources/js/locales/{code}/*.json get hand-edited (or pulled via git)
 * without the DB store changing. The translations editor read the DB only, so
 * already-translated keys showed as English — and saving any key rewrote the
 * whole namespace file from the stale DB copy, reverting those hand edits.
 */
const LTS_DRIFT_CODE = 'zz_drift_test';

afterEach(function () {
    File::deleteDirectory(resource_path('js/locales/' . LTS_DRIFT_CODE));
});

function ltsDriftSetUp(): void
{
    LocaleTranslationFile::create([
        'locale_code' => LTS_DRIFT_CODE,
        'namespace' => 'system',
        'content' => ['translationKey' => 'stale-db-key', 'translationSource' => 'db-only-source'],
    ]);

    File::ensureDirectoryExists(resource_path('js/locales/' . LTS_DRIFT_CODE));
    File::put(
        resource_path('js/locales/' . LTS_DRIFT_CODE . '/system.json'),
        json_encode(['translationKey' => 'hand-edited-key', 'translationValue' => 'disk-only-value'])
    );
}

test('the editor shows hand-edited disk values over a stale DB copy, and keeps DB-only keys', function () {
    ltsDriftSetUp();

    $entries = collect(app(LocaleTranslationService::class)->getNamespaceEntries(LTS_DRIFT_CODE, 'system'))->pluck('value', 'path');

    expect($entries['translationKey'])->toBe('hand-edited-key');
    expect($entries['translationValue'])->toBe('disk-only-value');
    expect($entries['translationSource'])->toBe('db-only-source');
});

test('saving one key does not revert other hand-edited keys on disk', function () {
    ltsDriftSetUp();

    app(LocaleTranslationService::class)->updateNamespaceEntries(LTS_DRIFT_CODE, 'system', ['translationSource' => 'edited-in-ui']);

    $disk = json_decode(File::get(resource_path('js/locales/' . LTS_DRIFT_CODE . '/system.json')), true);
    expect($disk['translationKey'])->toBe('hand-edited-key');
    expect($disk['translationValue'])->toBe('disk-only-value');
    expect($disk['translationSource'])->toBe('edited-in-ui');

    $db = LocaleTranslationFile::where('locale_code', LTS_DRIFT_CODE)->where('namespace', 'system')->value('content');
    expect($db['translationKey'])->toBe('hand-edited-key');
});
