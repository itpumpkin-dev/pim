<?php

use App\Http\Controllers\Catalog\CategoryController;
use App\Models\Category;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CategoryController::edit() bounces a level-3 category (a "product group")
 * straight to catalog.productGroups.edit — but the route hitting this method
 * is gated only by `categories,edit_categories`, a DIFFERENT permission
 * resource than the one the destination page actually requires
 * (`product_groups,edit_product_groups`). Without an explicit check before
 * the redirect, a user with only the categories permission could bounce
 * through to editing product groups they have no real permission for. These
 * tests lock in the fix.
 */
function cepController(): CategoryController
{
    return app(CategoryController::class);
}

function cepUserWithPermission(?string $resource = null, ?string $action = null): User
{
    $user = User::factory()->create();
    if ($resource === null) {
        return $user;
    }

    $role = Role::create(['label' => 'Role '.uniqid()]);
    $user->roles()->attach($role->id);
    DB::table('role_permissions')->insert([
        'role_id' => $role->id,
        'resource' => $resource,
        'action' => $action,
        'granted' => true,
    ]);

    return $user;
}

function cepProductGroup(): Category
{
    $root = Category::create(['code' => 'cep_root_'.uniqid(), 'name' => 'Root']);
    $sub = Category::create(['code' => 'cep_sub_'.uniqid(), 'name' => 'Sub', 'parent_id' => $root->id]);

    return Category::create(['code' => 'cep_grp_'.uniqid(), 'name' => 'Group', 'parent_id' => $sub->id]);
}

test('edit() bounces to the product-group editor for a user who actually has product_groups edit permission', function () {
    $group = cepProductGroup();
    $user = cepUserWithPermission('product_groups', 'edit_product_groups');
    $this->actingAs($user);

    $response = cepController()->edit($group);

    expect($response)->toBeInstanceOf(\Illuminate\Http\RedirectResponse::class);
    expect($response->getTargetUrl())->toContain("/catalog/product-groups/{$group->id}/edit");
});

test('edit() refuses to bounce a user who only has categories permission, not product_groups', function () {
    $group = cepProductGroup();
    $user = cepUserWithPermission('categories', 'edit_categories');
    $this->actingAs($user);

    expect(fn () => cepController()->edit($group))
        ->toThrow(fn (HttpException $e) => $e->getStatusCode() === 403);
});

test('edit() refuses to bounce a user with no permissions at all', function () {
    $group = cepProductGroup();
    $user = cepUserWithPermission();
    $this->actingAs($user);

    expect(fn () => cepController()->edit($group))
        ->toThrow(fn (HttpException $e) => $e->getStatusCode() === 403);
});
