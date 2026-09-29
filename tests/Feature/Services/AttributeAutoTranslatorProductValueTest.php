<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\TranslationProvider;
use App\Services\AttributeAutoTranslator;
use Illuminate\Support\Facades\Http;

function aatEnsureLocale(string $code): int
{
    return Locale::firstOrCreate(['code' => $code], ['display_name' => strtoupper($code), 'enabled' => true])->id;
}

/**
 * AttributeAutoTranslator::fillMissingProductValue() used to read/write
 * ProductValue by product_id+attribute_id alone — a scalar pluck()/
 * updateOrCreate() that silently picked whichever row the DB returned first
 * once an attribute could have more than one row (one per
 * attribute_group_id placement, see migration
 * 2026_09_23_000001_add_attribute_group_id_to_product_values_table). It now
 * targets EffectiveFamilyAttributeResolver::primaryGroupIdFor() deterministically
 * and must never write into a DIFFERENT group's row.
 */
/**
 * The translation_providers table migration always seeds one real default
 * row (LibreTranslate against a live public instance — see
 * 2026_07_29_000000_create_translation_providers_table.php's seedFromEnv())
 * so translation keeps working out of the box. That seeded row is
 * `is_default = true` too, and TranslationProvider::where('is_default',
 * true)->first() has no explicit ordering, so it (not this test's fake
 * provider) is the one that actually wins — silently sending real requests
 * to the internet during tests. Disable it before creating the fake.
 */
function aatSetUpFakeProvider(): void
{
    TranslationProvider::query()->update(['enabled' => false, 'is_default' => false]);

    TranslationProvider::create([
        'type' => 'libretranslate',
        'name' => 'Fake',
        'credentials' => ['url' => 'https://fake-translate.test/translate'],
        'enabled' => true,
        'is_default' => true,
    ]);

    Http::fake([
        'fake-translate.test/*' => Http::response(['translatedText' => ['translated text']]),
    ]);
}

test('fillMissingProductValue() targets the primary (lowest id) group placement and never touches the other group', function () {
    aatSetUpFakeProvider();

    $thaiLocaleId = aatEnsureLocale('th');
    $enLocaleId = aatEnsureLocale('en');

    $attribute = Attribute::create(['code' => 'aat_multi_attr', 'type' => 'text', 'is_locale_based' => true]);
    $groupA = AttributeGroup::create(['code' => 'aat_group_a']);
    $groupB = AttributeGroup::create(['code' => 'aat_group_b']);
    $family = AttributeFamily::create(['code' => 'aat_family', 'name' => 'AAT Family']);

    // groupA has the lower id -> primaryGroupIdFor() must pick it.
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);
    expect($groupA->id)->toBeLessThan($groupB->id);

    $category = Category::create(['code' => 'aat_category', 'name' => 'AAT Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'AAT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    // groupB already has its OWN Thai value — must be left completely alone.
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'locale_id' => $thaiLocaleId, 'value' => 'group B text']);

    app(AttributeAutoTranslator::class)->fillMissingProductValue($product->id, $attribute->id, $thaiLocaleId, 'group A source text');

    $groupARow = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)
        ->where('attribute_group_id', $groupA->id)->where('locale_id', $enLocaleId)->first();
    $groupBRows = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)
        ->where('attribute_group_id', $groupB->id)->get();

    expect($groupARow)->not->toBeNull();
    expect($groupARow->value)->toBe('translated text');

    // groupB's pre-existing row must be untouched — no cross-contamination.
    expect($groupBRows)->toHaveCount(1);
    expect($groupBRows->first()->locale_id)->toBe($thaiLocaleId);
    expect($groupBRows->first()->value)->toBe('group B text');
});

test('fillMissingProductValue() writes to attribute_group_id = null for an attribute with no group placement', function () {
    aatSetUpFakeProvider();

    $thaiLocaleId = aatEnsureLocale('th');
    $enLocaleId = aatEnsureLocale('en');

    $attribute = Attribute::create(['code' => 'aat_ungrouped_attr', 'type' => 'text', 'is_locale_based' => true]);
    $product = Product::create(['sku' => 'AAT-UNGROUPED-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    app(AttributeAutoTranslator::class)->fillMissingProductValue($product->id, $attribute->id, $thaiLocaleId, 'ungrouped source');

    $row = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->where('locale_id', $enLocaleId)->first();
    expect($row)->not->toBeNull();
    expect($row->attribute_group_id)->toBeNull();
    expect($row->value)->toBe('translated text');
});

test('fillMissingProductValue() records an "AI translated" audit entry on the product, attributed to the requesting user', function () {
    aatSetUpFakeProvider();

    $thaiLocaleId = aatEnsureLocale('th');
    $enLocaleId = aatEnsureLocale('en');
    $user = App\Models\User::factory()->create();

    $attribute = Attribute::create(['code' => 'aat_audit_attr', 'type' => 'text', 'is_locale_based' => true]);
    $product = Product::create(['sku' => 'AAT-AUDIT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    $errors = app(AttributeAutoTranslator::class)->fillMissingProductValue($product->id, $attribute->id, $thaiLocaleId, 'source', $user->id);

    expect($errors)->toBe([]);
    $log = App\Models\AuditLog::where('event', 'attribute_values_auto_translated')
        ->where('auditable_type', $product->getMorphClass())->where('auditable_id', $product->id)->first();
    expect($log)->not->toBeNull();
    expect($log->user_id)->toBe($user->id);
    expect($log->new_values)->toHaveKey("aat_audit_attr[locale:{$enLocaleId}]", 'translated text');
    expect($log->old_values["aat_audit_attr[locale:{$enLocaleId}]"])->toBeNull();
});

test('fillMissingProductValue() fills a locale whose existing row is blank instead of skipping it', function () {
    aatSetUpFakeProvider();

    $thaiLocaleId = aatEnsureLocale('th');
    $enLocaleId = aatEnsureLocale('en');

    $attribute = Attribute::create(['code' => 'aat_blank_attr', 'type' => 'text', 'is_locale_based' => true]);
    $product = Product::create(['sku' => 'AAT-BLANK-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $enLocaleId, 'value' => '']);

    app(AttributeAutoTranslator::class)->fillMissingProductValue($product->id, $attribute->id, $thaiLocaleId, 'source');

    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->where('locale_id', $enLocaleId)->value('value'))
        ->toBe('translated text');
});

test('fillMissingProductValue() returns per-locale provider errors and records no audit entry when nothing was written', function () {
    // not aatSetUpFakeProvider(): its 200 stub would be matched first and win
    TranslationProvider::query()->update(['enabled' => false, 'is_default' => false]);
    TranslationProvider::create([
        'type' => 'libretranslate',
        'name' => 'Fake',
        'credentials' => ['url' => 'https://fake-translate.test/translate'],
        'enabled' => true,
        'is_default' => true,
    ]);
    Http::fake(['fake-translate.test/*' => Http::response(['error' => 'bad key'], 403)]);

    $thaiLocaleId = aatEnsureLocale('th');
    aatEnsureLocale('en');

    $attribute = Attribute::create(['code' => 'aat_error_attr', 'type' => 'text', 'is_locale_based' => true]);
    $product = Product::create(['sku' => 'AAT-ERR-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    $errors = app(AttributeAutoTranslator::class)->fillMissingProductValue($product->id, $attribute->id, $thaiLocaleId, 'source');

    expect($errors)->not->toBeEmpty();
    expect($errors[0])->toStartWith('en: ');
    expect(App\Models\AuditLog::where('event', 'attribute_values_auto_translated')->where('auditable_id', $product->id)->exists())->toBeFalse();
});
