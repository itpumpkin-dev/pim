<?php

namespace App\Services;

use App\Jobs\AutoTranslateJsonLabelsJob;
use App\Jobs\AutoTranslateLabelsJob;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\AttributeTranslation;
use App\Models\Category;
use App\Models\CategoryField;
use App\Models\CategoryTranslation;
use App\Models\JobTracker;
use App\Models\Locale;
use Illuminate\Database\Eloquent\Model;

/**
 * Translation-coverage view over the app's dynamic (EAV-style) multi-language
 * content — Attributes, Attribute Options, Categories, and Category Fields —
 * as opposed to LocaleTranslationService, which covers the static i18n JSON
 * UI strings. Powers the "Content" tab on the locale translations page and
 * the bulk/one-off "translate missing" actions there.
 */
class ContentTranslationCoverageService
{
    /**
     * @return array<int, array{key: string, label: string, total: int, translated: int, missing: array}>
     */
    public function coverage(int $localeId): array
    {
        // `name` = the record's fallback label column (raw, not the target
        // locale) — plain context so whoever's translating can tell what each
        // row actually is instead of decoding the `code`. tableGroup() fetches
        // these `without('translations')`, so these accessors return the raw
        // column, not a locale-resolved value — no extra queries.
        return [
            $this->tableGroup('attributes', 'Attributes', Attribute::class, AttributeTranslation::class, 'attribute_id', $localeId,
                fn (Attribute $a) => ['id' => $a->id, 'code' => $a->code, 'name' => (string) $a->name, 'editUrl' => "/catalog/attributes/{$a->id}/edit"]),
            $this->tableGroup('attribute_options', 'Attribute Options', AttributeOption::class, AttributeOptionTranslation::class, 'attribute_option_id', $localeId,
                fn (AttributeOption $o) => ['id' => $o->id, 'code' => $o->code, 'name' => (string) ($o->admin_label ?: $o->code), 'editUrl' => "/catalog/attributes/{$o->attribute_id}/edit"]),
            $this->tableGroup('categories', 'Categories', Category::class, CategoryTranslation::class, 'category_id', $localeId,
                fn (Category $c) => ['id' => $c->id, 'code' => $c->code, 'name' => (string) $c->name, 'editUrl' => "/catalog/categories/{$c->id}/edit"]),
            $this->categoryFieldGroup($localeId),
        ];
    }

    /**
     * Queues auto-translation for every record of the given type that's
     * currently missing a label in $localeId — same "prefer the app default
     * locale, else whichever locale actually has a label" source resolution
     * as the per-record autoTranslate() methods on the catalog controllers,
     * just run in bulk. Ignores each record's own `is_ai_translate` flag on
     * purpose (same as TranslateMissingCategoryLabels): this is an explicit,
     * user-triggered bulk run, not the automatic translate-on-save behavior.
     *
     * @return int number of records queued
     */
    public function queueMissing(string $type, int $localeId, ?int $userId = null): int
    {
        $tracker = JobTracker::openTranslation($type, "missing:{$type}", $userId);

        $queued = match ($type) {
            'attributes' => $this->queueTableGroup(Attribute::class, AttributeTranslation::class, 'attribute_id', $localeId, $tracker),
            'attribute_options' => $this->queueTableGroup(AttributeOption::class, AttributeOptionTranslation::class, 'attribute_option_id', $localeId, $tracker),
            'categories' => $this->queueTableGroup(Category::class, CategoryTranslation::class, 'category_id', $localeId, $tracker),
            'category_fields' => $this->queueCategoryFields($localeId, $tracker),
            default => 0,
        };

        // Nothing to translate (or an unknown type) — close the tracker now,
        // otherwise it sits at "processing" with a 0/0 bar forever.
        if ($queued === 0) {
            $tracker->update(['status' => 'completed', 'completed_at' => now()]);
        }

        return $queued;
    }

    /**
     * Same as queueMissing(), for a single record — the per-row "Translate"
     * action on the Content tab.
     */
    public function queueOne(string $type, int $id, ?int $userId = null): bool
    {
        $tracker = JobTracker::openTranslation($type, "{$type}:{$id}", $userId);

        $queued = match ($type) {
            'attributes' => $this->queueOneTableRecord(Attribute::find($id), AttributeTranslation::class, 'attribute_id', $tracker),
            'attribute_options' => $this->queueOneTableRecord(AttributeOption::find($id), AttributeOptionTranslation::class, 'attribute_option_id', $tracker),
            'categories' => $this->queueOneTableRecord(Category::find($id), CategoryTranslation::class, 'category_id', $tracker),
            'category_fields' => $this->queueOneCategoryField(CategoryField::find($id), $tracker),
            default => false,
        };

        if (! $queued) {
            $tracker->update(['status' => 'completed', 'completed_at' => now()]);
        }

        return $queued;
    }

    /**
     * @param  class-string<Model>  $modelClass
     * @param  class-string<Model>  $translationClass
     * @param  callable(Model): array  $mapMissing
     */
    private function tableGroup(string $key, string $label, string $modelClass, string $translationClass, string $foreignKey, int $localeId, callable $mapMissing): array
    {
        $total = $modelClass::count();

        $translatedIds = $translationClass::where('locale_id', $localeId)
            ->whereNotNull('label')
            ->where('label', '!=', '')
            ->pluck($foreignKey)
            ->unique();

        // without('translations'): the mapper only needs id/code/etc, but
        // Attribute/Category both default-eager-load their full translations
        // relation on every query — fetching (and discarding) every
        // translation row for records this is about to report as
        // translation-*less* is pure waste, worst at Category's 1000+ scale.
        $missingModels = $modelClass::query()->without('translations')->whereNotIn('id', $translatedIds)->orderBy('id')->get();

        return [
            'key' => $key,
            'label' => $label,
            'total' => $total,
            'translated' => $total - $missingModels->count(),
            'missing' => $missingModels->map($mapMissing)->values()->all(),
        ];
    }

    private function categoryFieldGroup(int $localeId): array
    {
        $fields = CategoryField::all(['id', 'code', 'labels']);

        $missing = $fields->filter(
            fn (CategoryField $f) => trim((string) ($f->labels[$localeId] ?? '')) === ''
        );

        return [
            'key' => 'category_fields',
            'label' => 'Category Fields',
            'total' => $fields->count(),
            'translated' => $fields->count() - $missing->count(),
            'missing' => $missing->map(fn (CategoryField $f) => [
                'id' => $f->id,
                'code' => $f->code,
                // labels is a {localeId: label} JSON map — show whichever label
                // it does have (prefer the app default) as readable context.
                'name' => (string) ($this->resolveSource((array) $f->labels)[1] ?: $f->code),
                'editUrl' => "/catalog/categoryFields/{$f->id}/edit",
            ])->values()->all(),
        ];
    }

    /**
     * @param  class-string<Model>  $modelClass
     * @param  class-string<Model>  $translationClass
     */
    private function queueTableGroup(string $modelClass, string $translationClass, string $foreignKey, int $localeId, ?JobTracker $tracker = null): int
    {
        $translatedIds = $translationClass::where('locale_id', $localeId)
            ->whereNotNull('label')
            ->where('label', '!=', '')
            ->pluck($foreignKey)
            ->unique();

        $missingIds = $modelClass::whereNotIn('id', $translatedIds)->pluck('id');

        // Batch-fetch every missing record's existing translations in one
        // query (grouped in memory) rather than one query per record inside
        // the loop below — with categories alone routinely running into the
        // thousands, a per-record query here meant "Translate all missing"
        // could fire 1000+ sequential queries in a single request.
        $translationsByOwner = $translationClass::whereIn($foreignKey, $missingIds)
            ->get([$foreignKey, 'locale_id', 'label'])
            ->groupBy($foreignKey);

        $queued = 0;

        foreach ($missingIds as $id) {
            $translations = ($translationsByOwner->get($id) ?? collect())->pluck('label', 'locale_id')->all();
            [$sourceLocaleId, $sourceLabel] = $this->resolveSource($translations);

            if ($sourceLocaleId === null || $sourceLabel === '') {
                continue;
            }

            $tracker?->noteTranslationQueued();
            AutoTranslateLabelsJob::dispatch($translationClass, $foreignKey, $id, $sourceLocaleId, $sourceLabel, $tracker?->id);
            $queued++;
        }

        return $queued;
    }

    private function queueCategoryFields(int $localeId, ?JobTracker $tracker = null): int
    {
        $fields = CategoryField::all(['id', 'labels']);
        $queued = 0;

        foreach ($fields as $field) {
            $labels = (array) $field->labels;

            if (trim((string) ($labels[$localeId] ?? '')) !== '') {
                continue;
            }

            [$sourceLocaleId, $sourceLabel] = $this->resolveSource($labels);

            if ($sourceLocaleId === null || $sourceLabel === '') {
                continue;
            }

            $tracker?->noteTranslationQueued();
            AutoTranslateJsonLabelsJob::dispatch(CategoryField::class, $field->id, 'labels', $sourceLocaleId, $sourceLabel, $tracker?->id);
            $queued++;
        }

        return $queued;
    }

    /**
     * @param  class-string<Model>  $translationClass
     */
    private function queueOneTableRecord(?Model $record, string $translationClass, string $foreignKey, ?JobTracker $tracker = null): bool
    {
        if (!$record) {
            return false;
        }

        $translations = $translationClass::where($foreignKey, $record->id)->pluck('label', 'locale_id')->all();
        [$sourceLocaleId, $sourceLabel] = $this->resolveSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return false;
        }

        $tracker?->noteTranslationQueued();
        AutoTranslateLabelsJob::dispatch($translationClass, $foreignKey, $record->id, $sourceLocaleId, $sourceLabel, $tracker?->id);

        return true;
    }

    private function queueOneCategoryField(?CategoryField $field, ?JobTracker $tracker = null): bool
    {
        if (!$field) {
            return false;
        }

        $labels = (array) $field->labels;
        [$sourceLocaleId, $sourceLabel] = $this->resolveSource($labels);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return false;
        }

        $tracker?->noteTranslationQueued();
        AutoTranslateJsonLabelsJob::dispatch(CategoryField::class, $field->id, 'labels', $sourceLocaleId, $sourceLabel, $tracker?->id);

        return true;
    }

    /**
     * Picks which locale to translate FROM — prefers the app's default
     * locale when it has a label, else falls back to whichever locale
     * actually has one. Same priority as every autoTranslate() on the
     * catalog controllers.
     *
     * @param  array<int|string, mixed>  $translations
     * @return array{0: int|null, 1: string}
     */
    private function resolveSource(array $translations): array
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));
        $defaultLabel = trim((string) ($translations[$defaultLocaleId] ?? ''));

        if ($defaultLocaleId !== null && $defaultLabel !== '') {
            return [$defaultLocaleId, $defaultLabel];
        }

        foreach ($translations as $localeId => $label) {
            $label = trim((string) $label);
            if ($label !== '') {
                return [(int) $localeId, $label];
            }
        }

        return [null, ''];
    }
}
