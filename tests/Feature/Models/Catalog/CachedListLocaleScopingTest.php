<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeFamilyTranslation;
use App\Models\AttributeTranslation;
use App\Models\Locale;
use Illuminate\Support\Facades\App;

/**
 * Both Attribute and AttributeFamily default to eager-loading EVERY locale's
 * `translations` row per model (`$with = ['translations']`), and cachedList()
 * used to bake that straight into one `Cache::rememberForever()` blob shared
 * by every locale. On a catalog with many attributes/families and several
 * admin UI locales, that blob's size scales with rows × locales — unbounded
 * — and unserializing it (Illuminate\Cache\RedisStore::unserialize()) is
 * exactly what took down every page calling Attribute::cachedList() /
 * AttributeFamily::cachedList() (ProductController::index() first) with a
 * PHP "Allowed memory size exhausted" fatal in production. Fixed by scoping
 * both the eager-loaded translation AND the cache key to the current locale.
 */
function localeRow(string $code): Locale
{
    return Locale::create(['code' => $code, 'display_name' => $code, 'enabled' => true]);
}

test("Attribute::cachedList() only eager-loads the current locale's translation, not every locale", function () {
    $en = localeRow('cls_en');
    $th = localeRow('cls_th');
    $attribute = Attribute::create(['code' => 'cls_attr1', 'type' => 'text', 'name' => 'Fallback']);
    AttributeTranslation::create(['attribute_id' => $attribute->id, 'locale_id' => $en->id, 'label' => 'English Label']);
    AttributeTranslation::create(['attribute_id' => $attribute->id, 'locale_id' => $th->id, 'label' => 'Thai Label']);

    App::setLocale('cls_en');
    $list = Attribute::cachedList();
    $row = $list->firstWhere('id', $attribute->id);

    expect($row->translations)->toHaveCount(1);
    expect($row->translations->first()->locale_id)->toBe($en->id);
    expect($row->name)->toBe('English Label');
});

test('Attribute::cachedList() caches a separate entry per locale, so switching locale does not serve a stale name', function () {
    $en = localeRow('cls_en2');
    $th = localeRow('cls_th2');
    $attribute = Attribute::create(['code' => 'cls_attr2', 'type' => 'text', 'name' => 'Fallback']);
    AttributeTranslation::create(['attribute_id' => $attribute->id, 'locale_id' => $en->id, 'label' => 'English Label']);
    AttributeTranslation::create(['attribute_id' => $attribute->id, 'locale_id' => $th->id, 'label' => 'Thai Label']);

    App::setLocale('cls_en2');
    $enName = Attribute::cachedList()->firstWhere('id', $attribute->id)->name;

    App::setLocale('cls_th2');
    $thName = Attribute::cachedList()->firstWhere('id', $attribute->id)->name;

    expect($enName)->toBe('English Label');
    expect($thName)->toBe('Thai Label');
});

test('AttributeFamily::cachedList() only eager-loads the current locale\'s translation, not every locale', function () {
    $en = localeRow('cls_en3');
    $th = localeRow('cls_th3');
    $family = AttributeFamily::create(['code' => 'cls_family1', 'name' => 'Fallback']);
    AttributeFamilyTranslation::create(['attribute_family_id' => $family->id, 'locale_id' => $en->id, 'label' => 'English Family']);
    AttributeFamilyTranslation::create(['attribute_family_id' => $family->id, 'locale_id' => $th->id, 'label' => 'Thai Family']);

    App::setLocale('cls_en3');
    $row = AttributeFamily::cachedList()->firstWhere('id', $family->id);

    expect($row->translations)->toHaveCount(1);
    expect($row->translations->first()->locale_id)->toBe($en->id);
    expect($row->name)->toBe('English Family');
});
