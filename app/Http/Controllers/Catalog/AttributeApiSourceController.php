<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\AttributeApiSource;
use App\Services\Catalog\ApiAttributeOptionSync;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AttributeApiSourceController extends Controller
{
    private const AUTH_TYPES = ['none', 'api_key_header', 'bearer', 'basic'];

    /** auth_type => credential field keys it requires (mirrors TranslationProviderController's per-type fields) */
    private const CREDENTIAL_FIELDS = [
        'none' => [],
        'api_key_header' => ['header_name', 'api_key'],
        'bearer' => ['token'],
        'basic' => ['username', 'password'],
    ];

    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_api_source_grid');

        return Inertia::render('catalog/attributeApiSources/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/attributeApiSources/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateSource($request);
        $credentials = $this->requireCredentials($validated['auth_type'], $validated['credentials'] ?? []);

        AttributeApiSource::create([
            ...$validated,
            'credentials' => $credentials,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        return to_route('catalog.attributeApiSources.index')->with('success', 'API source created successfully.');
    }

    public function edit(AttributeApiSource $attributeApiSource): Response
    {
        $fields = self::CREDENTIAL_FIELDS[$attributeApiSource->auth_type] ?? [];
        $existing = $attributeApiSource->credentials ?? [];

        return Inertia::render('catalog/attributeApiSources/edit', [
            'attributeApiSource' => [
                'id' => $attributeApiSource->id,
                'name' => $attributeApiSource->name,
                'endpoint' => $attributeApiSource->endpoint,
                'method' => $attributeApiSource->method,
                'auth_type' => $attributeApiSource->auth_type,
                'rows_path' => $attributeApiSource->rows_path,
                'code_path' => $attributeApiSource->code_path,
                'label_path' => $attributeApiSource->label_path,
                'is_active_path' => $attributeApiSource->is_active_path,
                'is_active' => $attributeApiSource->is_active,
                // Never send credential values to the browser — only which
                // fields already have one set (see TranslationProviderController::edit()).
                'credentials_set' => collect($fields)->mapWithKeys(
                    fn (string $key) => [$key => filled($existing[$key] ?? null)],
                )->toArray(),
            ],
        ]);
    }

    public function update(Request $request, AttributeApiSource $attributeApiSource): RedirectResponse
    {
        $validated = $this->validateSource($request);
        $existing = $attributeApiSource->auth_type === $validated['auth_type'] ? ($attributeApiSource->credentials ?? []) : [];
        $credentials = $this->requireCredentials($validated['auth_type'], $validated['credentials'] ?? [], $existing);

        $attributeApiSource->update([
            ...$validated,
            'credentials' => $credentials,
            'updated_by' => $request->user()->id,
        ]);

        return to_route('catalog.attributeApiSources.index')->with('success', 'API source updated successfully.');
    }

    public function destroy(AttributeApiSource $attributeApiSource): RedirectResponse
    {
        $attributeApiSource->delete();

        return to_route('catalog.attributeApiSources.index')->with('success', 'API source deleted successfully.');
    }

    /**
     * "Test connection" button on the create/edit form — runs the source's
     * fetch+mapping (without persisting anything) and returns the first few
     * rows so an admin can confirm rows_path/code_path/label_path before
     * saving or binding any attribute to it.
     */
    public function test(AttributeApiSource $attributeApiSource): JsonResponse
    {
        try {
            $rows = app(ApiAttributeOptionSync::class)->preview($attributeApiSource);

            return response()->json(['rows' => $rows]);
        } catch (\Throwable $e) {
            return response()->json(['rows' => [], 'error' => $e->getMessage()], 422);
        }
    }

    /**
     * @return array{name: string, endpoint: string, method: string, auth_type: string, credentials?: array,
     *     rows_path: ?string, code_path: string, label_path: string, is_active_path: ?string, is_active: bool}
     */
    private function validateSource(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'endpoint' => ['required', 'string', 'max:2048', 'url'],
            'method' => ['required', 'in:GET,POST'],
            'auth_type' => ['required', 'in:' . implode(',', self::AUTH_TYPES)],
            'credentials' => ['array'],
            'rows_path' => ['nullable', 'string', 'max:255'],
            'code_path' => ['required', 'string', 'max:255'],
            'label_path' => ['required', 'string', 'max:255'],
            'is_active_path' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ]);
    }

    /**
     * Merges submitted credential values over the existing ones (blank
     * submitted values keep whatever was already stored) and enforces that
     * every field the auth type requires ends up populated — same pattern as
     * TranslationProviderController::requireCredentials().
     *
     * @param array<string, mixed> $submitted
     * @param array<string, mixed> $existing
     * @return array<string, mixed>
     */
    private function requireCredentials(string $authType, array $submitted, array $existing = []): array
    {
        $keys = self::CREDENTIAL_FIELDS[$authType] ?? [];
        $merged = $existing;

        foreach ($submitted as $key => $value) {
            if ($value !== null && $value !== '') {
                $merged[$key] = $value;
            }
        }

        foreach ($keys as $key) {
            if (blank($merged[$key] ?? null)) {
                throw ValidationException::withMessages([
                    "credentials.{$key}" => "The {$key} field is required for this auth type.",
                ]);
            }
        }

        return Arr::only($merged, $keys);
    }
}
