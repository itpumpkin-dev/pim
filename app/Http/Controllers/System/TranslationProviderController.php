<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\TranslationProvider;
use App\Services\GridManager;
use App\Services\Translation\TranslationProviderRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class TranslationProviderController extends Controller
{
    public function index(Request $request): Response
    {
        $grid = new GridManager('translation_provider_grid');

        return Inertia::render('system/translationProvider/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('system/translationProvider/create', [
            'providerTypes' => TranslationProviderRegistry::schema(),
        ]);
    }

    /**
     * Populates a "dynamic" credential field (see HasDynamicCredentialOptions)
     * by calling out to the provider's own API with whatever credentials
     * have been entered so far — e.g. listing the models actually installed
     * on a given Ollama server. Read-only, so this is a plain JSON GET
     * rather than an Inertia page visit.
     */
    public function fieldOptions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', 'in:' . implode(',', TranslationProviderRegistry::TYPES)],
            'field' => ['required', 'string'],
        ]);

        if (! TranslationProviderRegistry::supportsDynamicOptions($validated['type'])) {
            return response()->json(['options' => []]);
        }

        try {
            $options = TranslationProviderRegistry::resolve($validated['type'])
                ->fetchOptions($validated['field'], $request->except(['type', 'field']));

            return response()->json(['options' => $options]);
        } catch (\Throwable $e) {
            return response()->json(['options' => [], 'error' => $e->getMessage()]);
        }
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', 'in:' . implode(',', TranslationProviderRegistry::TYPES)],
            'name' => ['required', 'string', 'max:100'],
            'enabled' => ['boolean'],
            'is_default' => ['boolean'],
            'credentials' => ['array'],
        ]);

        $credentials = $this->requireCredentials($validated['type'], $validated['credentials'] ?? []);

        if ($validated['is_default'] ?? false) {
            // ปรับทีละแถวผ่าน model ให้ event `updated` ของ Auditable ทำงาน —
            // การสลับ default ออกจาก provider เดิมจึงถูกบันทึกลง audit_logs
            TranslationProvider::where('is_default', true)->get()->each->update(['is_default' => false]);
        }

        TranslationProvider::create([
            'type' => $validated['type'],
            'name' => $validated['name'],
            'credentials' => $credentials,
            'enabled' => $validated['enabled'] ?? true,
            'is_default' => $validated['is_default'] ?? false,
        ]);

        return to_route('system.translationProviders.index')->with('success', 'Translation provider created successfully.');
    }

    public function edit(TranslationProvider $translationProvider): Response
    {
        $fields = TranslationProviderRegistry::schema()[$translationProvider->type]['fields'] ?? [];
        $existing = $translationProvider->credentials ?? [];

        return Inertia::render('system/translationProvider/edit', [
            'providerTypes' => TranslationProviderRegistry::schema(),
            'translationProvider' => [
                'id' => $translationProvider->id,
                'type' => $translationProvider->type,
                'name' => $translationProvider->name,
                'enabled' => $translationProvider->enabled,
                'is_default' => $translationProvider->is_default,
                // Never send credential values to the browser — only which
                // fields already have one set, so the form can show a
                // placeholder and leave them untouched unless overwritten.
                'credentials_set' => collect($fields)->mapWithKeys(
                    fn (array $field) => [$field['key'] => filled($existing[$field['key']] ?? null)],
                )->toArray(),
            ],
        ]);
    }

    public function update(Request $request, TranslationProvider $translationProvider): RedirectResponse
    {
        $validated = $request->validate([
            'type' => ['required', 'string', 'in:' . implode(',', TranslationProviderRegistry::TYPES)],
            'name' => ['required', 'string', 'max:100'],
            'enabled' => ['boolean'],
            'is_default' => ['boolean'],
            'credentials' => ['array'],
        ]);

        $existing = $translationProvider->type === $validated['type'] ? ($translationProvider->credentials ?? []) : [];
        $credentials = $this->requireCredentials($validated['type'], $validated['credentials'] ?? [], $existing);

        DB::transaction(function () use ($validated, $credentials, $translationProvider) {
            if ($validated['is_default'] ?? false) {
                // ปรับทีละแถวผ่าน model ให้ event `updated` ของ Auditable ทำงาน —
                // การสลับ default ออกจาก provider เดิมจึงถูกบันทึกลง audit_logs
                TranslationProvider::where('is_default', true)
                    ->where('id', '!=', $translationProvider->id)
                    ->get()
                    ->each->update(['is_default' => false]);
            }

            $translationProvider->update([
                'type' => $validated['type'],
                'name' => $validated['name'],
                'credentials' => $credentials,
                'enabled' => $validated['enabled'] ?? true,
                'is_default' => $validated['is_default'] ?? false,
            ]);
        });

        return to_route('system.translationProviders.index')->with('success', 'Translation provider updated successfully.');
    }

    public function destroy(TranslationProvider $translationProvider): RedirectResponse
    {
        $translationProvider->delete();

        return to_route('system.translationProviders.index')->with('success', 'Translation provider deleted successfully.');
    }

    public function test(TranslationProvider $translationProvider): RedirectResponse
    {
        try {
            $translated = TranslationProviderRegistry::resolve($translationProvider->type)
                ->translateBatch(['Hello'], 'en', 'th', $translationProvider->credentials ?? []);

            return back()->with('success', 'Test translation succeeded: "Hello" → "' . ($translated[0] ?? '') . '"');
        } catch (\Throwable $e) {
            return back()->with('error', 'Test translation failed: ' . $e->getMessage());
        }
    }

    /**
     * Merges submitted credential values over the existing ones (blank
     * submitted values keep whatever was already stored) and enforces that
     * every field the provider type marks required ends up populated.
     *
     * @param array<string, mixed> $submitted
     * @param array<string, mixed> $existing
     * @return array<string, mixed>
     */
    private function requireCredentials(string $type, array $submitted, array $existing = []): array
    {
        $fields = TranslationProviderRegistry::schema()[$type]['fields'] ?? [];
        $merged = $existing;

        foreach ($submitted as $key => $value) {
            if ($value !== null && $value !== '') {
                $merged[$key] = $value;
            }
        }

        foreach ($fields as $field) {
            if ($field['required'] && blank($merged[$field['key']] ?? null)) {
                throw ValidationException::withMessages([
                    "credentials.{$field['key']}" => "The {$field['label']} field is required.",
                ]);
            }
        }

        return $merged;
    }
}
