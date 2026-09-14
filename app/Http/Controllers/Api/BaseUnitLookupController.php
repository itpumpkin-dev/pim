<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\BuildsLocalizedLabelMap;
use App\Http\Controllers\Controller;
use App\Models\BaseUnit;
use App\Models\Locale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Read-only lookup for the Base Units master (see BaseUnit model's
 * docblock — its `code` is what a product's `pbaseunit` attribute value
 * actually stores). Same exposure rule as the other lookup controllers in
 * this namespace: index() sits behind the api_key middleware, show() is
 * public. Only active units are ever returned.
 */
class BaseUnitLookupController extends Controller
{
    use BuildsLocalizedLabelMap;

    private const MAX_PER_PAGE = 200;

    public function index(Request $request): JsonResponse
    {
        $perPage = max(1, min((int) $request->query('per_page', 50), self::MAX_PER_PAGE));

        $units = BaseUnit::with('translations')
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate($perPage)
            ->withQueryString();

        $locales = Locale::pluck('code', 'id');
        $data = $units->getCollection()->map(fn (BaseUnit $unit) => $this->present($unit, $locales));

        return response()->json([
            'data' => $data->values(),
            'meta' => [
                'current_page' => $units->currentPage(),
                'per_page' => $units->perPage(),
                'total' => $units->total(),
                'last_page' => $units->lastPage(),
            ],
        ]);
    }

    public function show(string $code): JsonResponse
    {
        $unit = BaseUnit::with('translations')
            ->where('code', $code)
            ->where('is_active', true)
            ->first();

        if (!$unit) {
            return response()->json(['message' => "Base unit with code '{$code}' not found"], 404);
        }

        return response()->json($this->present($unit, Locale::pluck('code', 'id')));
    }

    private function present(BaseUnit $unit, Collection $locales): array
    {
        return [
            'id' => $unit->id,
            'code' => $unit->code,
            'name' => $this->localizedLabelMap($unit->translations, $unit->name, $locales),
            'slug' => $unit->slug,
            'description' => $unit->description,
            'is_active' => (bool) $unit->is_active,
            'sort_order' => $unit->sort_order,
            'created_at' => $unit->created_at?->toDateTimeString(),
            'updated_at' => $unit->updated_at?->toDateTimeString(),
        ];
    }
}
