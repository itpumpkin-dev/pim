<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\JobTracker;
use App\Models\Locale;
use App\Services\GridManager;
use App\Services\LocaleTranslationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class LocaleController extends Controller
{
    public function __construct(private readonly LocaleTranslationService $localeTranslationService)
    {
    }

    public function index(Request $request): Response
    {
        $grid = new GridManager('locale_grid');

        return Inertia::render('system/locale/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
            // Standalone auto-translation runs (job_type = 'translation'),
            // newest first — powers the "Translation Jobs" tab. Only the last
            // 50 so the payload stays small; the tab is a live status view,
            // not a full history log.
            'translationJobs' => JobTracker::where('job_type', 'translation')
                ->with('user:id,username,first_name,last_name')
                ->latest('id')
                ->limit(50)
                ->get([
                    'id', 'entity_type', 'config_code', 'status', 'user_id',
                    'total_translations_queued', 'total_translations_completed',
                    'error_log', 'started_at', 'completed_at', 'created_at',
                ])
                ->map(function (JobTracker $j) {
                    $userName = $j->user?->username
                        ?: trim(($j->user?->first_name ?? '') . ' ' . ($j->user?->last_name ?? ''));

                    return [
                        'id' => $j->id,
                        'entity_type' => $j->entity_type,
                        'reference' => $j->config_code,
                        'status' => $j->status,
                        'queued' => $j->total_translations_queued,
                        'completed' => $j->total_translations_completed,
                        'errors' => is_array($j->error_log) ? count($j->error_log) : 0,
                        'user' => $userName !== '' ? $userName : null,
                        'started_at' => $j->started_at?->toIso8601String(),
                        'completed_at' => $j->completed_at?->toIso8601String(),
                        'created_at' => $j->created_at?->toIso8601String(),
                    ];
                }),
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

        $locale = Locale::create([
            'code' => $validated['code'],
            'display_name' => $validated['display_name'] ?? null,
            'enabled' => $validated['enabled'] ?? true,
        ]);

        // Folder + English fallback only — translation is a separate,
        // explicit step the admin triggers from the locales list. Scaffolding
        // is best-effort: if it fails (e.g. a filesystem issue with the
        // entered code), the locale row still exists and the admin should
        // still land on the list rather than the request dying mid-flight.
        try {
            $this->localeTranslationService->scaffoldLocale($locale);
        } catch (\Throwable $e) {
            Log::error('Failed to scaffold locale folder after creating locale.', [
                'locale_id' => $locale->id,
                'code' => $locale->code,
                'error' => $e->getMessage(),
            ]);
        }

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

    public function translate(Locale $locale): RedirectResponse
    {
        $this->localeTranslationService->queueTranslation($locale);

        return back()->with('success', 'Translation started.');
    }
}
