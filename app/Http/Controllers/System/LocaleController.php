<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\Locale;
use App\Services\GridManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LocaleController extends Controller
{
    public function index(Request $request): Response
    {
        $grid = new GridManager('locale_grid');

        return Inertia::render('system/locale/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('system/locale/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:20', 'unique:locales,code'],
            'display_name' => ['nullable', 'string', 'max:100'],
            'enabled' => ['boolean'],
        ]);

        Locale::create([
            'code' => $validated['code'],
            'display_name' => $validated['display_name'] ?? null,
            'enabled' => $validated['enabled'] ?? true,
        ]);

        return to_route('system.locales.index')->with('success', 'Locale created successfully.');
    }

    public function edit(Locale $locale): Response
    {
        return Inertia::render('system/locale/edit', [
            'localeModel' => $locale->only(['id', 'code', 'display_name', 'enabled']),
        ]);
    }

    public function update(Request $request, Locale $locale): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:20', 'unique:locales,code,' . $locale->id],
            'display_name' => ['nullable', 'string', 'max:100'],
            'enabled' => ['boolean'],
        ]);

        $locale->update([
            'code' => $validated['code'],
            'display_name' => $validated['display_name'] ?? null,
            'enabled' => $validated['enabled'] ?? true,
        ]);

        return to_route('system.locales.index')->with('success', 'Locale updated successfully.');
    }

    public function destroy(Locale $locale): RedirectResponse
    {
        $locale->delete();

        return to_route('system.locales.index')->with('success', 'Locale deleted successfully.');
    }
}
