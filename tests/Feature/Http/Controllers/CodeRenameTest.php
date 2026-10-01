<?php

use App\Models\Attribute;
use App\Models\AttributeGroup;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\CategoryField;
use App\Models\Channel;
use App\Models\ExportConfig;
use App\Models\JobTracker;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\Role;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\ImportExport\ImportExportRegistry;
use Illuminate\Support\Facades\DB;

/**
 * Renaming a record's code from its edit page — every resource is gated on
 * its own `{resource}.edit_code` permission (CodeRenameGuard), keeps the codes
 * the app looks up locked, and carries string copies of the old code along.
 * Goes through the real routes so the route's own edit permission and the
 * controller's code check are both exercised.
 */
function crActingAs(string $resource, string $editAction, bool $canEditCode = true): User
{
    $user = User::factory()->create();
    $role = Role::create(['label' => 'Role '.uniqid()]);
    $user->roles()->attach($role->id);

    $rows = [['role_id' => $role->id, 'resource' => $resource, 'action' => $editAction, 'granted' => true]];
    if ($canEditCode) {
        $rows[] = ['role_id' => $role->id, 'resource' => $resource, 'action' => 'edit_code', 'granted' => true];
    }
    DB::table('role_permissions')->insert($rows);

    // EnsureFreshPermissions logs out disabled users and sessions whose
    // permissions_version doesn't match the user's
    $user->forceFill(['enabled' => true])->save();
    $user = $user->fresh(); // load the DB default permissions_version
    test()->actingAs($user)->withSession(['permissions_version' => $user->permissions_version]);

    return $user;
}

function crRestrictedRole(string $kind, string $code): Role
{
    $role = Role::create(['label' => 'Restricted '.uniqid()]);
    DB::table('role_permissions')->insert([
        ['role_id' => $role->id, 'resource' => "view_{$kind}", 'action' => "view_{$code}", 'granted' => true],
        ['role_id' => $role->id, 'resource' => "edit_{$kind}", 'action' => "edit_{$code}", 'granted' => true],
    ]);

    return $role;
}

// ── shared guard ────────────────────────────────────────────────────────

test('a changed code without edit_code is refused, an unchanged one still saves', function () {
    crActingAs('attribute_groups', 'edit_attribute_groups', canEditCode: false);
    $group = AttributeGroup::create(['code' => 'cr_group']);

    $this->put("/catalog/attributeGroups/{$group->id}", ['code' => 'cr_other'])->assertForbidden();
    $this->put("/catalog/attributeGroups/{$group->id}", ['code' => 'cr_group'])->assertRedirect();

    expect($group->fresh()->code)->toBe('cr_group');
});

test('the new code must be well-formed and not taken', function (string $code) {
    crActingAs('attribute_groups', 'edit_attribute_groups');
    AttributeGroup::create(['code' => 'cr_taken']);
    $group = AttributeGroup::create(['code' => 'cr_mine']);

    $this->put("/catalog/attributeGroups/{$group->id}", ['code' => $code])->assertSessionHasErrors('code');

    expect($group->fresh()->code)->toBe('cr_mine');
})->with(['cr_taken', 'has space', 'slash/code', 'ไทย']);

// ── attribute groups ───────────────────────────────────────────────────

test('renaming an attribute group carries its Attribute Access permissions over', function () {
    crActingAs('attribute_groups', 'edit_attribute_groups');
    $group = AttributeGroup::create(['code' => 'cr_specs']);
    $role = crRestrictedRole('attribute_groups', 'cr_specs');

    $this->put("/catalog/attributeGroups/{$group->id}", ['code' => 'cr_specs_v2'])->assertRedirect();

    expect($group->fresh()->code)->toBe('cr_specs_v2');
    expect(DB::table('role_permissions')->where('role_id', $role->id)->orderBy('resource')->pluck('action')->all())
        ->toBe(['edit_cr_specs_v2', 'view_cr_specs_v2']);
});

test('attribute groups the app looks up by code stay locked', function () {
    crActingAs('attribute_groups', 'edit_attribute_groups');
    $group = AttributeGroup::firstOrCreate(['code' => 'general']);

    $this->put("/catalog/attributeGroups/{$group->id}", ['code' => 'cr_general'])->assertForbidden();
});

// ── attributes ─────────────────────────────────────────────────────────

test('renaming an attribute updates its permissions and the code → id map', function () {
    crActingAs('attributes', 'edit_attributes');
    $attribute = Attribute::create(['code' => 'cr_colour', 'type' => 'text']);
    $role = crRestrictedRole('attributes', 'cr_colour');
    Attribute::idForCode('cr_colour'); // warm the cached map

    $this->put("/catalog/attributes/{$attribute->id}", ['code' => 'cr_color', 'type' => 'text'])->assertRedirect();

    expect($attribute->fresh()->code)->toBe('cr_color');
    expect(Attribute::idForCode('cr_color'))->toBe($attribute->id);
    expect(Attribute::idForCode('cr_colour'))->toBeNull();
    expect(DB::table('role_permissions')->where('role_id', $role->id)->orderBy('resource')->pluck('action')->all())
        ->toBe(['edit_cr_color', 'view_cr_color']);
});

test('system and marketplace-created attributes stay locked', function (array $attributes) {
    crActingAs('attributes', 'edit_attributes');
    $attribute = Attribute::firstOrCreate(['code' => $attributes['code']], $attributes);

    $this->put("/catalog/attributes/{$attribute->id}", ['code' => 'cr_renamed', 'type' => $attribute->type])->assertForbidden();
})->with([
    'pname' => [['code' => 'pname', 'type' => 'text']],
    'auto-created' => [['code' => 'cr_lazada_made', 'type' => 'text', 'auto_created_platform' => 'lazada']],
]);

// ── categories ─────────────────────────────────────────────────────────

test('renaming a category re-prefixes its subtree and every copy of its codes', function () {
    crActingAs('categories', 'edit_categories');
    $root = Category::create(['code' => 'q01', 'name' => 'Root']);
    $sub = Category::create(['code' => 'q01001', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'q01001001', 'name' => 'Group', 'parent_id' => $sub->id]);

    $pcatname = Attribute::firstOrCreate(['code' => 'pcatname'], ['type' => 'select']);
    $pcatname->update(['master_source' => 'categories']);
    $groupAttr = Attribute::firstOrCreate(['code' => 'productgroupname'], ['type' => 'select']);
    $groupAttr->update(['master_source' => 'product_groups']);
    $option = AttributeOption::updateOrCreate(['attribute_id' => $pcatname->id, 'code' => 'q01'], ['admin_label' => 'Root']);

    $product = Product::create(['sku' => 'CR-SKU-1']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $pcatname->id, 'value' => 'q01']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $groupAttr->id, 'value' => 'q01001001']);
    DB::table('woo_category_aliases')->insert(['match_key' => 'cr', 'woo_category_text' => 'cr', 'pcatname' => 'Q01', 'psubcatname' => 'q01001']);

    $this->put("/catalog/categories/{$root->id}", ['code' => 'Q99', 'description' => '', 'parent_id' => ''])->assertRedirect();

    expect([$root->fresh()->code, $sub->fresh()->code, $group->fresh()->code])->toBe(['Q99', 'Q99001', 'Q99001001']);
    expect($option->fresh()->code)->toBe('q99'); // same row, id kept
    expect(ProductValue::where('product_id', $product->id)->orderBy('attribute_id')->pluck('value')->all())->toBe(['q99', 'q99001001']);
    expect((array) DB::table('woo_category_aliases')->where('match_key', 'cr')->first(['pcatname', 'psubcatname']))
        ->toBe(['pcatname' => 'Q99', 'psubcatname' => 'Q99001']);
});

test('the raw-material root is locked and codes cannot cross the v… boundary', function () {
    crActingAs('categories', 'edit_categories');
    $raw = Category::create(['code' => 'v', 'name' => 'Raw']);
    $regular = Category::create(['code' => 'q02', 'name' => 'Regular']);

    $this->put("/catalog/categories/{$raw->id}", ['code' => 'w', 'description' => '', 'parent_id' => ''])->assertForbidden();
    $this->put("/catalog/categories/{$regular->id}", ['code' => 'v02', 'description' => '', 'parent_id' => ''])->assertSessionHasErrors('code');

    expect($regular->fresh()->code)->toBe('q02');
});

test('a rename is refused when a re-prefixed child code is already taken', function () {
    crActingAs('categories', 'edit_categories');
    $root = Category::create(['code' => 'q03', 'name' => 'Root']);
    Category::create(['code' => 'q03001', 'name' => 'Child', 'parent_id' => $root->id]);
    Category::create(['code' => 'q04001', 'name' => 'Elsewhere']);

    $this->put("/catalog/categories/{$root->id}", ['code' => 'q04', 'description' => '', 'parent_id' => ''])->assertSessionHasErrors('code');

    expect($root->fresh()->code)->toBe('q03');
});

// ── category fields ────────────────────────────────────────────────────

test('renaming a category field moves the stored values onto the new key', function () {
    crActingAs('category_fields', 'edit_category_fields');
    $field = CategoryField::create(['code' => 'cr_tagline', 'type' => 'Text', 'labels' => ['1' => 'Tagline'], 'is_required' => false, 'status' => true, 'position' => 1]);
    $category = Category::create(['code' => 'q05', 'name' => 'Cat', 'additional_data' => ['cr_tagline' => 'Hello', 'name_eng' => 'Cat']]);
    $payload = ['type' => 'Text', 'labels' => ['1' => 'Tagline'], 'is_required' => false, 'status' => true, 'position' => 1];

    $this->put("/catalog/categoryFields/{$field->id}", ['code' => 'name_eng', ...$payload])->assertSessionHasErrors('code');
    $this->put("/catalog/categoryFields/{$field->id}", ['code' => 'cr_slogan', ...$payload])->assertRedirect();

    expect($field->fresh()->code)->toBe('cr_slogan');
    expect($category->fresh()->additional_data)->toEqual(['cr_slogan' => 'Hello', 'name_eng' => 'Cat']); // jsonb doesn't keep key order
});

// ── channels ───────────────────────────────────────────────────────────

test('a channel can be renamed, but not onto the reserved "default" key', function () {
    crActingAs('channels', 'edit_channels');
    $channel = Channel::create(['code' => 'cr_web']);
    $localeId = DB::table('locales')->value('id') ?? DB::table('locales')->insertGetId(['code' => 'en', 'enabled' => true]);
    $currencyId = DB::table('currencies')->value('id') ?? DB::table('currencies')->insertGetId(['code' => 'THB', 'name' => 'Baht']);
    $payload = ['locale_ids' => [$localeId], 'currency_ids' => [$currencyId]];

    $this->put("/catalog/channels/{$channel->id}", ['code' => 'default', ...$payload])->assertSessionHasErrors('code');
    $this->put("/catalog/channels/{$channel->id}", ['code' => 'cr_store', ...$payload])->assertRedirect();

    expect($channel->fresh()->code)->toBe('cr_store');
});

// ── sales platforms & shops ────────────────────────────────────────────

test('built-in marketplace platforms stay locked', function () {
    crActingAs('sales_platforms', 'edit_sales_platforms');
    $lazada = SalesPlatform::firstOrCreate(['code' => 'lazada'], ['name' => 'Lazada']);

    $this->put("/catalog/sales-platforms/{$lazada->id}", ['code' => 'cr_lzd', 'name' => 'Lazada'])->assertForbidden();
});

test('renaming a custom platform keeps attribute groups pointing at it', function () {
    crActingAs('sales_platforms', 'edit_sales_platforms');
    $platform = SalesPlatform::create(['code' => 'cr_mall', 'name' => 'Mall']);
    $group = AttributeGroup::create(['code' => 'cr_mall_group', 'platform' => 'cr_mall']);

    $this->put("/catalog/sales-platforms/{$platform->id}", ['code' => 'cr_mall2', 'name' => 'Mall'])->assertRedirect();

    expect($platform->fresh()->code)->toBe('cr_mall2');
    expect($group->fresh()->platform)->toBe('cr_mall2');
});

test('shop codes only need to be unique within their platform', function () {
    crActingAs('sales_platforms', 'edit_sales_platforms');
    $a = SalesPlatform::create(['code' => 'cr_pa', 'name' => 'A']);
    $b = SalesPlatform::create(['code' => 'cr_pb', 'name' => 'B']);
    SalesPlatformShop::create(['sales_platform_id' => $a->id, 'code' => 'cr_taken', 'name' => 'A1']);
    SalesPlatformShop::create(['sales_platform_id' => $b->id, 'code' => 'cr_taken_b', 'name' => 'B0']);
    $shop = SalesPlatformShop::create(['sales_platform_id' => $b->id, 'code' => 'cr_shop', 'name' => 'B1', 'channel_id' => Channel::create(['code' => 'cr_pb_cr_shop'])->id]);

    $this->put("/catalog/sales-platforms/shops/{$shop->id}", ['code' => 'cr_taken_b', 'name' => 'B1'])->assertSessionHasErrors('code');
    $this->put("/catalog/sales-platforms/shops/{$shop->id}", ['code' => 'cr_taken', 'name' => 'B1'])->assertRedirect();

    expect($shop->fresh()->code)->toBe('cr_taken');
});

// ── import / export profiles ───────────────────────────────────────────

test('renaming an export profile updates its job history snapshot only', function () {
    crActingAs('export_configs', 'edit_export_configs');
    $type = ImportExportRegistry::TYPES[0];
    $config = ExportConfig::create(['code' => 'cr_export', 'type' => $type]);
    $own = JobTracker::create(['job_type' => 'export', 'entity_type' => $type, 'config_code' => 'cr_export', 'export_config_id' => $config->id]);
    $unrelated = JobTracker::create(['job_type' => 'import', 'entity_type' => $type, 'config_code' => 'cr_export']);

    $this->put("/import-export/exports/{$config->id}", ['code' => 'cr_export_daily', 'type' => $type, 'file_format' => 'csv'])->assertRedirect();

    expect($config->fresh()->code)->toBe('cr_export_daily');
    expect($own->fresh()->config_code)->toBe('cr_export_daily');
    expect($unrelated->fresh()->config_code)->toBe('cr_export');
});
