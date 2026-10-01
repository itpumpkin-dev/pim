<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\AttributeFamily;
use App\Models\ImportConfig;
use App\Models\Role;
use App\Models\User;
use App\Services\Catalog\WooCommerceAttributeFamilyGenerator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Renaming an attribute family's code rides on the regular update route but
 * is gated on its own `attribute_families.edit_code` permission — the code is
 * the lookup key for import configs / WooCommerce conversions, so a rename
 * must cascade to them, and the WooCommerce generator's fixed family stays
 * locked.
 */
function afecController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

function afecActingAs(bool $canEditCode): User
{
    $user = User::factory()->create();
    if ($canEditCode) {
        $role = Role::create(['label' => 'Role '.uniqid()]);
        $user->roles()->attach($role->id);
        DB::table('role_permissions')->insert([
            'role_id' => $role->id,
            'resource' => 'attribute_families',
            'action' => 'edit_code',
            'granted' => true,
        ]);
    }
    test()->actingAs($user);

    return $user;
}

function afecUpdate(AttributeFamily $family, string $code)
{
    return afecController()->update(
        Request::create("/catalog/attributeFamilies/{$family->id}", 'PUT', ['code' => $code]),
        $family,
    );
}

test('a user with edit_code can rename the code, and import configs follow it', function () {
    afecActingAs(true);
    $family = AttributeFamily::create(['code' => 'afec_old', 'name' => 'Old']);
    $config = ImportConfig::create(['code' => 'afec_cfg', 'type' => 'products', 'family_code' => 'afec_old']);

    afecUpdate($family, 'afec_new');

    expect($family->fresh()->code)->toBe('afec_new');
    expect($config->fresh()->family_code)->toBe('afec_new');
});

test('a user without edit_code gets 403 when the code changes', function () {
    afecActingAs(false);
    $family = AttributeFamily::create(['code' => 'afec_keep', 'name' => 'Keep']);

    expect(fn () => afecUpdate($family, 'afec_changed'))->toThrow(HttpException::class);
    expect($family->fresh()->code)->toBe('afec_keep');
});

test('a user without edit_code can still save when the code is unchanged', function () {
    afecActingAs(false);
    $family = AttributeFamily::create(['code' => 'afec_same', 'name' => 'Same']);

    afecUpdate($family, 'afec_same');

    expect($family->fresh()->code)->toBe('afec_same');
});

test('the code must be unique and use only letters, digits, _ and -', function (string $code) {
    afecActingAs(true);
    AttributeFamily::create(['code' => 'afec_taken', 'name' => 'Taken']);
    $family = AttributeFamily::create(['code' => 'afec_mine', 'name' => 'Mine']);

    expect(fn () => afecUpdate($family, $code))->toThrow(ValidationException::class);
})->with(['afec_taken', 'afec space', 'afec/slash']);

test('the WooCommerce family code is locked even for users with edit_code', function () {
    afecActingAs(true);
    $family = AttributeFamily::create(['code' => WooCommerceAttributeFamilyGenerator::FAMILY_CODE, 'name' => 'Woo']);

    expect(fn () => afecUpdate($family, 'afec_woo'))->toThrow(HttpException::class);
});
