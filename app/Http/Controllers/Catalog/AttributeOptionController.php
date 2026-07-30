<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * CRUD for select/multiselect attribute options, including their swatch
 * value (hex color, uploaded image, or plain text label depending on the
 * parent attribute's `swatch_type`). Nested under the attribute rather than
 * a top-level resource since options only ever make sense in that context.
 * Redirects back to the attribute edit page like every other catalog
 * controller, rather than returning JSON, so Inertia's normal form-submit
 * flow (CSRF, validation error bag, etc.) just works.
 */
class AttributeOptionController extends Controller
{
    public function store(Request $request, Attribute $attribute): RedirectResponse
    {
        $validated = $request->validate([
            'code' => [
                'required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/',
                Rule::unique('attribute_options', 'code')->where('attribute_id', $attribute->id),
            ],
            'admin_label' => ['nullable', 'string', 'max:255'],
            'swatch_value' => ['nullable', 'string', 'max:255'],
            'swatch_image' => ['nullable', 'image', 'max:2048'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $swatchValue = $validated['swatch_value'] ?? null;
        if ($attribute->swatch_type === 'image' && $request->hasFile('swatch_image')) {
            $swatchValue = $request->file('swatch_image')->store('attribute-options', 'public');
        }

        $attribute->options()->create([
            'code' => $validated['code'],
            'admin_label' => $validated['admin_label'] ?? null,
            'swatch_value' => $swatchValue,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return back()->with('success', 'Option added successfully.');
    }

    public function update(Request $request, Attribute $attribute, AttributeOption $option): RedirectResponse
    {
        $validated = $request->validate([
            'code' => [
                'required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/',
                Rule::unique('attribute_options', 'code')->where('attribute_id', $attribute->id)->ignore($option->id),
            ],
            'admin_label' => ['nullable', 'string', 'max:255'],
            'swatch_value' => ['nullable', 'string', 'max:255'],
            'swatch_image' => ['nullable', 'image', 'max:2048'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $swatchValue = $validated['swatch_value'] ?? $option->swatch_value;
        if ($attribute->swatch_type === 'image' && $request->hasFile('swatch_image')) {
            $swatchValue = $request->file('swatch_image')->store('attribute-options', 'public');
        }

        $option->update([
            'code' => $validated['code'],
            'admin_label' => $validated['admin_label'] ?? null,
            'swatch_value' => $swatchValue,
            'sort_order' => $validated['sort_order'] ?? $option->sort_order,
        ]);

        return back()->with('success', 'Option updated successfully.');
    }

    public function destroy(Attribute $attribute, AttributeOption $option): RedirectResponse
    {
        $option->delete();

        return back()->with('success', 'Option deleted successfully.');
    }
}
