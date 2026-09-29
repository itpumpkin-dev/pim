<?php

namespace App\Services;

use App\Models\Attribute;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\TranslationProvider;
use App\Services\Catalog\EffectiveFamilyAttributeResolver;
use App\Services\Translation\TranslationProviderRegistry;
use Illuminate\Support\Facades\Log;

/**
 * Pre-fills empty-locale translation rows for a freshly entered attribute/option
 * label, using the enabled default TranslationProvider. Only touches locales that
 * don't already have a row for this owner — never overwrites a label someone
 * typed by hand or that a prior run already produced. Called from
 * AutoTranslateLabelsJob (queued), not directly from a request — a handful of
 * provider calls, one per missing locale, is too slow to make Save wait on.
 */
class AttributeAutoTranslator
{
    public function __construct(private readonly EffectiveFamilyAttributeResolver $familyAttributeResolver) {}

    /**
     * @param class-string<\Illuminate\Database\Eloquent\Model> $translationModel
     */
    public function fillMissing(string $translationModel, string $foreignKey, int $ownerId, int $sourceLocaleId, string $sourceLabel): void
    {
        $this->translateMissing($sourceLocaleId, $sourceLabel, function () use ($translationModel, $foreignKey, $ownerId) {
            return $translationModel::where($foreignKey, $ownerId)->pluck('label', 'locale_id')->all();
        }, function (string $label, Locale $locale) use ($translationModel, $foreignKey, $ownerId) {
            $translationModel::updateOrCreate(
                [$foreignKey => $ownerId, 'locale_id' => $locale->id],
                ['label' => $label]
            );
        }, ['model' => $translationModel, 'owner_id' => $ownerId]);
    }

    /**
     * Same pre-fill behavior as fillMissing(), but for models that store every
     * locale's label inline as a `{localeId: label}` JSON column (CategoryField's
     * `labels`) instead of one row per locale in a related translations table.
     *
     * @param class-string<\Illuminate\Database\Eloquent\Model> $modelClass
     */
    public function fillMissingJsonColumn(string $modelClass, int $ownerId, string $column, int $sourceLocaleId, string $sourceLabel): void
    {
        $model = $modelClass::find($ownerId);
        if (!$model) {
            return;
        }

        $labels = (array) ($model->{$column} ?? []);

        $this->translateMissing($sourceLocaleId, $sourceLabel, function () use ($labels) {
            return collect($labels)
                ->filter(fn ($label) => is_string($label) && trim($label) !== '')
                ->mapWithKeys(fn ($label, $id) => [(int) $id => $label])
                ->all();
        }, function (string $label, Locale $locale) use (&$labels) {
            $labels[(string) $locale->id] = $label;
        }, ['model' => $modelClass, 'owner_id' => $ownerId, 'column' => $column]);

        $model->update([$column => $labels]);
    }

    /**
     * Same pre-fill behavior again, but for a product's locale-based
     * attribute value (ProductValue), which — unlike the translations
     * tables fillMissing() targets — is keyed by (product_id, attribute_id,
     * channel_id, locale_id) rather than a single foreign key. Only ever
     * touches the channel_id = null (Default/All Channels) scope, matching
     * where an import lands a locale-based column's value in the first
     * place (see ProductRowImporter::importRow()).
     *
     * Passes retranslateIdenticalCopies: true — a lot of this catalog's
     * products already carry pre-existing per-locale rows that are just a
     * verbatim copy of the Thai source (leftover from an earlier import/seed
     * that never actually translated anything), not a real translation.
     * Treating those as "already covered" (fillMissing()'s normal behavior)
     * would silently skip them forever — every "AI translate" import would
     * report success while never actually translating a single one.
     *
     * Since one attribute can now be placed in more than one
     * attribute_group_id (see migration
     * 2026_09_23_000001_add_attribute_group_id_to_product_values_table), a
     * bare product_id+attribute_id lookup could match more than one row —
     * without picking a specific one, both the read (pluck() collapsing
     * multiple rows to one) and the write (updateOrCreate() targeting
     * whichever matching row the DB happens to return first) would become
     * nondeterministic. This method isn't group-aware itself (it only
     * translates one "primary" copy — see
     * EffectiveFamilyAttributeResolver::primaryGroupIdFor()), so any other
     * group placement of this attribute is left untouched, same as the
     * marketplace/CSV export/storefront consumers that share this
     * limitation for now.
     */
    /**
     * @param  int|null  $actorUserId  ผู้ที่สั่งแปล (user ของ JobTracker) — ใช้เป็นผู้กระทำใน
     *                                 audit log เพราะตอนรันใน queue ไม่มี auth() ให้อ่าน
     * @return array<int, string> error ของแต่ละภาษาที่แปลไม่สำเร็จ (ว่าง = สำเร็จทุกภาษา)
     */
    public function fillMissingProductValue(int $productId, int $attributeId, int $sourceLocaleId, string $sourceValue, ?int $actorUserId = null): array
    {
        $product = Product::find($productId);
        $effectiveFamilyIds = $product ? $this->familyAttributeResolver->effectiveFamilyIds($product) : [];
        $groupId = $this->familyAttributeResolver->primaryGroupIdFor($attributeId, $effectiveFamilyIds);

        $existing = [];
        $oldValues = [];
        $newValues = [];
        $code = Attribute::whereKey($attributeId)->value('code') ?? "attribute_{$attributeId}";
        // key รูปแบบเดียวกับ ProductController::productValueSnapshot() — diff ในแท็บ
        // ประวัติจะได้อ่านเหมือนการแก้ไขปกติ
        $auditKey = fn (int $localeId) => $code.'['.implode(',', array_filter([$groupId ? "group:{$groupId}" : null, "locale:{$localeId}"])).']';

        $errors = $this->translateMissing($sourceLocaleId, $sourceValue, function () use ($productId, $attributeId, $groupId, &$existing) {
            return $existing = ProductValue::where('product_id', $productId)
                ->where('attribute_id', $attributeId)
                ->where('attribute_group_id', $groupId)
                ->whereNull('channel_id')
                ->whereNotNull('locale_id')
                ->pluck('value', 'locale_id')
                ->all();
        }, function (string $value, Locale $locale) use ($productId, $attributeId, $groupId, &$existing, &$oldValues, &$newValues, $auditKey) {
            ProductValue::updateOrCreate(
                ['product_id' => $productId, 'attribute_id' => $attributeId, 'attribute_group_id' => $groupId, 'channel_id' => null, 'locale_id' => $locale->id],
                ['value' => $value]
            );
            $oldValues[$auditKey($locale->id)] = $existing[$locale->id] ?? null;
            $newValues[$auditKey($locale->id)] = $value;
        }, ['model' => ProductValue::class, 'product_id' => $productId, 'attribute_id' => $attributeId], retranslateIdenticalCopies: true);

        // ProductValue ไม่มี Auditable — ไม่บันทึกเองตรงนี้ ค่าที่ AI แปลจะไม่โผล่ในแท็บ
        // ประวัติของสินค้าเลย (แยกไม่ออกว่าค่าไหนเครื่องแปล ค่าไหนคนพิมพ์)
        if ($product && $newValues) {
            AuditLog::record('attribute_values_auto_translated', $product, $oldValues, $newValues, $actorUserId);
        }

        return $errors;
    }

    /**
     * Shared translate-every-missing-locale loop: resolves the provider and
     * source locale once, then calls $save for each locale not already
     * covered by $existingValuesByLocale() — the callers differ only in how
     * they read/write the target labels (related rows, a JSON column, or
     * ProductValue rows).
     *
     * $retranslateIdenticalCopies additionally targets a locale whose
     * existing value is a byte-for-byte copy of $sourceLabel — a real
     * translation into a different language essentially never equals the
     * source text verbatim, so that's a reliable "this was never actually
     * translated" signal, not a coincidence. Off by default (false) so
     * fillMissing()/fillMissingJsonColumn() keep their original "never
     * touch an existing row" guarantee for hand-typed labels.
     *
     * @param callable(): array<int, string> $existingValuesByLocale locale_id => current value
     * @param callable(string, Locale): void $save
     */
    /**
     * @return array<int, string> error ต่อภาษาที่แปลไม่สำเร็จ ("{locale}: {message}") —
     *         ผู้เรียกที่มี tracker เอาไปแสดงในแท็บงานแปลได้ (เดิมถูกกลืนลง log อย่างเดียว)
     */
    private function translateMissing(int $sourceLocaleId, string $sourceLabel, callable $existingValuesByLocale, callable $save, array $logContext, bool $retranslateIdenticalCopies = false): array
    {
        $sourceLabel = trim($sourceLabel);
        if ($sourceLabel === '') {
            return [];
        }

        $provider = TranslationProvider::where('enabled', true)->where('is_default', true)->first();
        if (!$provider) {
            return ['No enabled default translation provider is configured.'];
        }

        $sourceLocale = Locale::find($sourceLocaleId);
        if (!$sourceLocale) {
            return [];
        }

        $errors = [];

        $existingValues = $existingValuesByLocale();

        $targetLocales = Locale::active()->filter(function ($locale) use ($sourceLocale, $existingValues, $sourceLabel, $retranslateIdenticalCopies) {
            if ($locale->id === $sourceLocale->id) {
                return false;
            }
            // แถวที่มีอยู่แต่ค่าว่าง (บันทึกฟอร์มตอนช่องยังว่าง) ถือว่ายังไม่ได้แปล —
            // ไม่งั้นงานที่ controller มองว่า "ขาด" แล้วสั่งมา จะถูกข้ามทิ้งเงียบๆ ที่นี่
            if (!array_key_exists($locale->id, $existingValues) || trim((string) $existingValues[$locale->id]) === '') {
                return true;
            }

            return $retranslateIdenticalCopies && trim((string) $existingValues[$locale->id]) === $sourceLabel;
        });

        foreach ($targetLocales as $locale) {
            try {
                $translated = TranslationProviderRegistry::resolve($provider->type)
                    ->translateBatch([$sourceLabel], $sourceLocale->code, $locale->code, $provider->readableCredentials());

                $label = trim($translated[0] ?? '');
                if ($label === '') {
                    continue;
                }

                $save($label, $locale);
            } catch (\Throwable $e) {
                Log::warning('Auto-translation failed for one locale, skipping.', [
                    ...$logContext,
                    'locale' => $locale->code,
                    'error' => $e->getMessage(),
                ]);
                $errors[] = "{$locale->code}: {$e->getMessage()}";
            }
        }

        return $errors;
    }
}
