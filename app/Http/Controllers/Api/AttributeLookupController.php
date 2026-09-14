<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\BuildsLocalizedLabelMap;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Locale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Read-only lookup for attribute definitions — what ProductLookupController's
 * `attributes[].code` values refer to, and (for `select`/`multiselect`
 * attributes) what an option's stored code decodes to. Same exposure rule
 * as the other lookup controllers in this namespace: index() sits behind
 * the api_key middleware, show() is public. index() omits each attribute's
 * option list (just a count) to keep the payload light across all ~180
 * attributes; show() returns the full option list for that one attribute.
 */
class AttributeLookupController extends Controller
{
    use BuildsLocalizedLabelMap;

    private const MAX_PER_PAGE = 200;

    public function index(Request $request): JsonResponse
    {
        $perPage = max(1, min((int) $request->query('per_page', 50), self::MAX_PER_PAGE));

        $attributes = Attribute::with('translations')
            ->withCount('options')
            ->orderBy('code')
            ->paginate($perPage)
            ->withQueryString();

        $locales = Locale::pluck('code', 'id');
        $data = $attributes->getCollection()->map(fn (Attribute $attribute) => $this->present($attribute, $locales));

        return response()->json([
            'data' => $data->values(),
            'meta' => [
                'current_page' => $attributes->currentPage(),
                'per_page' => $attributes->perPage(),
                'total' => $attributes->total(),
                'last_page' => $attributes->lastPage(),
            ],
        ]);
    }

    public function show(string $code): JsonResponse
    {
        $attribute = Attribute::with('translations')->where('code', $code)->first();

        if (!$attribute) {
            return response()->json(['message' => "Attribute with code '{$code}' not found"], 404);
        }

        $locales = Locale::pluck('code', 'id');

        $rows = AttributeOption::with('translations')
            ->where('attribute_id', $attribute->id)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        // One extra query for every parent code referenced, instead of one
        // per option (rows can self-reference, e.g. Brand-style parent/child
        // options — see AttributeOption::parentOption()).
        $parentCodesById = AttributeOption::whereIn('id', $rows->pluck('parent_id')->filter()->unique())
            ->pluck('code', 'id');

        $options = $rows->map(fn (AttributeOption $option) => [
            'id' => $option->id,
            'code' => $option->code,
            'label' => $this->localizedLabelMap($option->translations, $option->getRawOriginal('admin_label'), $locales),
            'sort_order' => $option->sort_order,
            'parent_option_code' => $option->parent_id ? ($parentCodesById->get($option->parent_id) ?? null) : null,
        ]);

        return response()->json([
            ...$this->present($attribute, $locales, includeOptionsCount: false),
            'options' => $options->values(),
        ]);
    }

    private function present(Attribute $attribute, Collection $locales, bool $includeOptionsCount = true): array
    {
        $data = [
            'id' => $attribute->id,
            'code' => $attribute->code,
            'name' => $this->localizedLabelMap($attribute->translations, $attribute->getRawOriginal('name'), $locales),
            'type' => $attribute->type,
            'is_required' => (bool) $attribute->is_required,
            'is_unique' => (bool) $attribute->is_unique,
            'is_locale_based' => (bool) $attribute->is_locale_based,
            'is_channel_based' => (bool) $attribute->is_channel_based,
            'is_filterable' => (bool) $attribute->is_filterable,
            'master_source' => $attribute->master_source,
        ];

        if ($includeOptionsCount) {
            $data['options_count'] = $attribute->options_count;
        }

        return $data;
    }
}
