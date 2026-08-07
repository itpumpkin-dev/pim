<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Jobs\AutoTranslateLabelsJob;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Services\CodeGenerator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'swatch_value' => ['nullable', 'string', 'max:255'],
            'swatch_image' => ['nullable', 'image', 'max:2048'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $translations = $validated['translations'] ?? [];
        $adminLabel = $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null);

        $swatchValue = $validated['swatch_value'] ?? null;
        if ($attribute->swatch_type === 'image' && $request->hasFile('swatch_image')) {
            $swatchValue = $request->file('swatch_image')->store('attribute-options', 'public');
        }

        $option = CodeGenerator::createWithRetry(
            'attribute_options',
            'option',
            fn ($code) => $attribute->options()->create([
                'code' => $code,
                'admin_label' => $adminLabel,
                'swatch_value' => $swatchValue,
                'sort_order' => $validated['sort_order'] ?? 0,
            ]),
            scope: ['attribute_id' => $attribute->id],
        );

        $this->syncTranslations($option, $translations);
        $this->autoTranslate($attribute, $option, $translations);

        AuditLog::record('option_created', $attribute, null, $this->optionAuditFields($option));

        // Server-generated (see CodeGenerator) — flashed back so the quick-add
        // dialog on the product edit page can select this option immediately
        // without asking the caller to guess or supply a code of its own.
        return back()->with('success', 'Option added successfully.')->with('created_option_code', $option->code);
    }

    public function update(Request $request, Attribute $attribute, AttributeOption $option): RedirectResponse
    {
        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'swatch_value' => ['nullable', 'string', 'max:255'],
            'swatch_image' => ['nullable', 'image', 'max:2048'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $translations = $validated['translations'] ?? [];

        $swatchValue = $validated['swatch_value'] ?? $option->swatch_value;
        if ($attribute->swatch_type === 'image' && $request->hasFile('swatch_image')) {
            $swatchValue = $request->file('swatch_image')->store('attribute-options', 'public');
        }

        $oldFields = $this->optionAuditFields($option);

        $option->update([
            'admin_label' => $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null),
            'swatch_value' => $swatchValue,
            'sort_order' => $validated['sort_order'] ?? $option->sort_order,
        ]);

        $this->syncTranslations($option, $translations);
        $this->autoTranslate($attribute, $option, $translations);

        $newFields = $this->optionAuditFields($option);
        if ($oldFields !== $newFields) {
            AuditLog::record('option_updated', $attribute, $oldFields, $newFields);
        }

        return back()->with('success', 'Option updated successfully.');
    }

    /**
     * Saves every option row in one request instead of the usual one-PUT-per-row
     * flow — needed once an attribute has more than a handful of options (some
     * of these lists run into the hundreds), where clicking Save on each row
     * individually isn't practical.
     *
     * Deliberately does not run auto-translation (see store()/update()'s
     * autoTranslate()): with rows potentially in the hundreds, firing one
     * translation-provider call per missing locale per row synchronously here
     * would risk timing out the request. Options saved through this path keep
     * whatever labels were typed and are left for a manual translate pass.
     */
    public function batchUpdate(Request $request, Attribute $attribute): RedirectResponse
    {
        $validated = $request->validate([
            'options' => ['required', 'array'],
            'options.*.id' => [
                'required', 'integer',
                Rule::exists('attribute_options', 'id')->where('attribute_id', $attribute->id),
            ],
            'options.*.admin_label' => ['nullable', 'string', 'max:255'],
            'options.*.translations' => ['nullable', 'array'],
            'options.*.translations.*' => ['nullable', 'string', 'max:255'],
            'options.*.swatch_value' => ['nullable', 'string', 'max:255'],
            'options.*.swatch_image' => ['nullable', 'image', 'max:2048'],
        ]);

        $allOldFields = [];
        $allNewFields = [];

        DB::transaction(function () use ($validated, $attribute, $request, &$allOldFields, &$allNewFields) {
            foreach ($validated['options'] as $index => $optionData) {
                $option = AttributeOption::where('attribute_id', $attribute->id)->findOrFail($optionData['id']);
                $translations = $optionData['translations'] ?? [];

                $swatchValue = $optionData['swatch_value'] ?? $option->swatch_value;
                if ($attribute->swatch_type === 'image' && $request->hasFile("options.{$index}.swatch_image")) {
                    $swatchValue = $request->file("options.{$index}.swatch_image")->store('attribute-options', 'public');
                }

                $oldFields = $this->optionAuditFields($option);

                $option->update([
                    'admin_label' => $this->resolveAdminLabel($translations, $optionData['admin_label'] ?? null),
                    'swatch_value' => $swatchValue,
                ]);

                $this->syncTranslations($option, $translations);

                $newFields = $this->optionAuditFields($option);
                if ($oldFields !== $newFields) {
                    $allOldFields += $oldFields;
                    $allNewFields += $newFields;
                }
            }
        });

        if (!empty($allOldFields) || !empty($allNewFields)) {
            AuditLog::record('options_batch_updated', $attribute, $allOldFields, $allNewFields);
        }

        return back()->with('success', 'Options updated successfully.');
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

    /**
     * The raw `admin_label` column doubles as the fallback shown wherever a
     * translation is missing (see AttributeOption::adminLabel()) and as the
     * plain value read by callers that bypass the accessor entirely (e.g.
     * ProductPresenter's `pluck('admin_label', ...)`). Keep it in sync with
     * whatever the app's default locale is set to, same as
     * AttributeGroupController::resolveName().
     */
    private function resolveAdminLabel(array $translations, ?string $adminLabel): ?string
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));

        if ($defaultLocaleId !== null && !empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');
        if ($firstNonEmpty !== null) {
            return trim($firstNonEmpty);
        }

        return $adminLabel !== null && trim($adminLabel) !== '' ? trim($adminLabel) : null;
    }

    /**
     * Same pre-fill behavior as AttributeController::autoTranslate(), keyed
     * off the parent attribute's "AI translate" flag since options don't
     * carry their own — an option only ever exists under one attribute, so
     * that flag is the natural place for the admin to opt in.
     */
    private function autoTranslate(Attribute $attribute, AttributeOption $option, array $translations): void
    {
        if (!$attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        AutoTranslateLabelsJob::dispatch(
            AttributeOptionTranslation::class,
            'attribute_option_id',
            $option->id,
            $sourceLocaleId,
            $sourceLabel,
        );
    }

    /**
     * Picks which locale to translate FROM. Prefers the app's default
     * locale when it was filled in (matching resolveAdminLabel()'s
     * priority), but falls back to whichever locale actually has a label
     * otherwise — e.g. the product edit page's quick-add-option dialog only
     * ever submits the locale currently being edited, which is frequently
     * not the app default, so requiring the default locale specifically
     * silently skipped auto-translation for every option added that way.
     *
     * @param  array<int|string, mixed>  $translations
     * @return array{0: int|null, 1: string}
     */
    private function resolveAutoTranslateSource(array $translations): array
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));
        $defaultLabel = trim((string) ($translations[$defaultLocaleId] ?? ''));

        if ($defaultLocaleId !== null && $defaultLabel !== '') {
            return [$defaultLocaleId, $defaultLabel];
        }

        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';
            if ($label !== '') {
                return [(int) $localeId, $label];
            }
        }

        return [null, ''];
    }

    private function syncTranslations(AttributeOption $option, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                AttributeOptionTranslation::where('attribute_option_id', $option->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            AttributeOptionTranslation::updateOrCreate(
                ['attribute_option_id' => $option->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
