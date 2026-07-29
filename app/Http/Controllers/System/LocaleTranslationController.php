<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\Locale;
use App\Services\LocaleTranslationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LocaleTranslationController extends Controller
{
    public function __construct(private readonly LocaleTranslationService $localeTranslationService)
    {
    }

    public function edit(Locale $locale, Request $request): Response
    {
        abort_if($this->localeTranslationService->isSourceLocale($locale->code), 404);

        $namespaces = $this->localeTranslationService->getNamespaces();
        $namespace = $request->query('ns');

        if (! in_array($namespace, $namespaces, true)) {
            $namespace = $namespaces[0] ?? null;
        }

        return Inertia::render('system/locale/translations', [
            'localeModel' => $locale->only(['id', 'code', 'display_name']),
            'namespaces' => $namespaces,
            'activeNamespace' => $namespace,
            'entries' => $namespace ? $this->localeTranslationService->getNamespaceEntries($locale->code, $namespace) : [],
        ]);
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
