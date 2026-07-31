<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AuditLog;
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

        $option = $attribute->options()->create([
            'code' => $validated['code'],
            'admin_label' => $validated['admin_label'] ?? null,
            'swatch_value' => $swatchValue,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        AuditLog::record('option_created', $attribute, null, $this->optionAuditFields($option));

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

        $oldFields = $this->optionAuditFields($option);

        $option->update([
            'code' => $validated['code'],
            'admin_label' => $validated['admin_label'] ?? null,
            'swatch_value' => $swatchValue,
            'sort_order' => $validated['sort_order'] ?? $option->sort_order,
        ]);

        $newFields = $this->optionAuditFields($option);
        if ($oldFields !== $newFields) {
            AuditLog::record('option_updated', $attribute, $oldFields, $newFields);
        }

        return back()->with('success', 'Option updated successfully.');
    }

    public function destroy(Attribute $attribute, AttributeOption $option): RedirectResponse
    {
        $oldFields = $this->optionAuditFields($option);
        $option->delete();

        AuditLog::record('option_deleted', $attribute, $oldFields, null);

        return back()->with('success', 'Option deleted successfully.');
    }

    /**
     * Option create/update/delete are recorded against the parent attribute
     * (not the option itself) since options only ever get viewed via the
     * attribute's edit page — this is what shows up in its History tab.
     * Keys are prefixed by option id so a rename doesn't get mistaken for a
     * different option going missing.
     */
    private function optionAuditFields(AttributeOption $option): array
    {
        $prefix = "option#{$option->id}";

        return collect($option->only(['code', 'admin_label', 'swatch_value', 'sort_order']))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
    }
}
