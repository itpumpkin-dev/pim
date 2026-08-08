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
        return [
            $this->tableGroup('attributes', 'Attributes', Attribute::class, AttributeTranslation::class, 'attribute_id', $localeId,
                fn (Attribute $a) => ['id' => $a->id, 'code' => $a->code, 'editUrl' => "/catalog/attributes/{$a->id}/edit"]),
            $this->tableGroup('attribute_options', 'Attribute Options', AttributeOption::class, AttributeOptionTranslation::class, 'attribute_option_id', $localeId,
                fn (AttributeOption $o) => ['id' => $o->id, 'code' => $o->code, 'editUrl' => "/catalog/attributes/{$o->attribute_id}/edit"]),
            $this->tableGroup('categories', 'Categories', Category::class, CategoryTranslation::class, 'category_id', $localeId,
                fn (Category $c) => ['id' => $c->id, 'code' => $c->code, 'editUrl' => "/catalog/categories/{$c->id}/edit"]),
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
    public function queueMissing(string $type, int $localeId): int
    {
        return match ($type) {
            'attributes' => $this->queueTableGroup(Attribute::class, AttributeTranslation::class, 'attribute_id', $localeId),
            'attribute_options' => $this->queueTableGroup(AttributeOption::class, AttributeOptionTranslation::class, 'attribute_option_id', $localeId),
            'categories' => $this->queueTableGroup(Category::class, CategoryTranslation::class, 'category_id', $localeId),
            'category_fields' => $this->queueCategoryFields($localeId),
            default => 0,
        };
    }

    /**
     * Same as queueMissing(), for a single record — the per-row "Translate"
     * action on the Content tab.
     */
    public function queueOne(string $type, int $id): bool
    {
        return match ($type) {
            'attributes' => $this->queueOneTableRecord(Attribute::find($id), AttributeTranslation::class, 'attribute_id'),
            'attribute_options' => $this->queueOneTableRecord(AttributeOption::find($id), AttributeOptionTranslation::class, 'attribute_option_id'),
            'categories' => $this->queueOneTableRecord(Category::find($id), CategoryTranslation::class, 'category_id'),
            'category_fields' => $this->queueOneCategoryField(CategoryField::find($id)),
            default => false,
        };
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
                'editUrl' => "/catalog/categoryFields/{$f->id}/edit",
            ])->values()->all(),
        ];
    }

    /**
     * @param  class-string<Model>  $modelClass
     * @param  class-string<Model>  $translationClass
     */
    private function queueTableGroup(string $modelClass, string $translationClass, string $foreignKey, int $localeId): int
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

            AutoTranslateLabelsJob::dispatch($translationClass, $foreignKey, $id, $sourceLocaleId, $sourceLabel);
            $queued++;
        }

        return $queued;
    }

    private function queueCategoryFields(int $localeId): int
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

            AutoTranslateJsonLabelsJob::dispatch(CategoryField::class, $field->id, 'labels', $sourceLocaleId, $sourceLabel);
            $queued++;
        }

        return $queued;
    }

    /**
     * @param  class-string<Model>  $translationClass
     */
    private function queueOneTableRecord(?Model $record, string $translationClass, string $foreignKey): bool
    {
        if (!$record) {
            return false;
        }

        $translations = $translationClass::where($foreignKey, $record->id)->pluck('label', 'locale_id')->all();
        [$sourceLocaleId, $sourceLabel] = $this->resolveSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return false;
        }

        AutoTranslateLabelsJob::dispatch($translationClass, $foreignKey, $record->id, $sourceLocaleId, $sourceLabel);

        return true;
    }

    private function queueOneCategoryField(?CategoryField $field): bool
    {
        if (!$field) {
            return false;
        }

        $labels = (array) $field->labels;
        [$sourceLocaleId, $sourceLabel] = $this->resolveSource($labels);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return false;
        }

        AutoTranslateJsonLabelsJob::dispatch(CategoryField::class, $field->id, 'labels', $sourceLocaleId, $sourceLabel);

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
