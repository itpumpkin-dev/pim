<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\Locale;
use App\Services\ContentTranslationCoverageService;
use App\Services\LocaleTranslationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LocaleTranslationController extends Controller
{
    /**
     * Pseudo-namespace for the "Content" tab — dynamic (EAV) data translation
     * coverage, not one of LocaleTranslationService's static i18n JSON files.
     */
    private const CONTENT_NAMESPACE = 'content';

    public function __construct(
        private readonly LocaleTranslationService $localeTranslationService,
        private readonly ContentTranslationCoverageService $contentCoverage,
    ) {
    }

    public function edit(Locale $locale, Request $request): Response
    {
        // The source locale (English) has no DB-backed static-JSON store to
        // edit (see LocaleTranslationService — it's dev-authored on disk),
        // but its dynamic CONTENT (attribute/category/... labels) is a real,
        // independently-translatable locale like any other — e.g. this
        // install's original data was authored in Thai, so English content
        // needs the same "Content" coverage/backfill as every other locale.
        // Only the JSON-namespace tabs are unavailable for it.
        $isSourceLocale = $this->localeTranslationService->isSourceLocale($locale->code);

        $namespaces = $isSourceLocale ? [] : $this->localeTranslationService->getNamespaces();
        $namespace = $isSourceLocale ? self::CONTENT_NAMESPACE : $request->query('ns');

        if ($namespace !== self::CONTENT_NAMESPACE && ! in_array($namespace, $namespaces, true)) {
            $namespace = $namespaces[0] ?? null;
        }

        return Inertia::render('system/locale/translations', [
            'localeModel' => $locale->only(['id', 'code', 'display_name']),
            'namespaces' => $namespaces,
            'activeNamespace' => $namespace,
            'entries' => $namespace && $namespace !== self::CONTENT_NAMESPACE
                ? $this->localeTranslationService->getNamespaceEntries($locale->code, $namespace)
                : [],
            'contentGroups' => $namespace === self::CONTENT_NAMESPACE
                ? $this->contentCoverage->coverage($locale->id)
                : null,
        ]);
    }

    public function queueMissingContent(Request $request, Locale $locale): RedirectResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', 'in:attributes,attribute_options,categories,category_fields'],
        ]);

        $count = $this->contentCoverage->queueMissing($validated['type'], $locale->id, $request->user()?->id);

        return back()->with('success', "Queued {$count} record(s) for translation.");
    }

    public function queueOneContent(Request $request, Locale $locale): RedirectResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', 'in:attributes,attribute_options,categories,category_fields'],
            'id' => ['required', 'integer'],
        ]);

        $queued = $this->contentCoverage->queueOne($validated['type'], $validated['id'], $request->user()?->id);

        return back()->with(
            $queued ? 'success' : 'error',
            $queued ? 'Queued for translation.' : 'Nothing to translate from — this record has no label in any locale yet.'
        );
    }

    public function update(Request $request, Locale $locale): RedirectResponse
    {
        abort_if($this->localeTranslationService->isSourceLocale($locale->code), 404);

        $validated = $request->validate([
            'namespace' => ['required', 'string', 'in:' . implode(',', $this->localeTranslationService->getNamespaces())],
            'values' => ['required', 'array'],
            'values.*' => ['nullable', 'string'],
        ]);

        $this->localeTranslationService->updateNamespaceEntries($locale->code, $validated['namespace'], $validated['values']);

        return back()->with('success', 'Translations saved.');
    }
}
