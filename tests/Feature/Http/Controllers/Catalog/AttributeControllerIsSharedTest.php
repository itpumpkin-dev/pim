<?php

use App\Http\Controllers\Catalog\AttributeController;
use App\Models\Attribute;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * `is_shared` — the new "reusable across families" checkbox on the Attribute
 * create/edit pages. AttributeController::store()/update() call
 * $request->user()->id directly (no null-safe operator, unlike
 * ProductController), so these need a real authenticated user attached to
 * the hand-built Request, unlike the ProductController-style tests.
 */
function acController(): AttributeController
{
    return app(AttributeController::class);
}

function acRequestAs(User $user, string $uri, string $method, array $params = []): Request
{
    $request = Request::create($uri, $method, $params);
    $request->setUserResolver(fn () => $user);

    return $request;
}

test('store persists is_shared as true when checked', function () {
    $user = User::factory()->create();

    $request = acRequestAs($user, '/catalog/attributes', 'POST', [
        'type' => 'text',
        'is_shared' => true,
    ]);

    acController()->store($request);

    $attribute = Attribute::latest('id')->firstOrFail();
    expect($attribute->is_shared)->toBeTrue();
});

test('store defaults is_shared to false when not sent (an unchecked checkbox submits nothing)', function () {
    $user = User::factory()->create();

    $request = acRequestAs($user, '/catalog/attributes', 'POST', [
        'type' => 'text',
    ]);

    acController()->store($request);

    $attribute = Attribute::latest('id')->firstOrFail();
    expect($attribute->is_shared)->toBeFalse();
});

test('update can flip an existing attribute\'s is_shared from false to true', function () {
    $user = User::factory()->create();
    $attribute = Attribute::create(['code' => 'toggle_me', 'type' => 'text', 'is_shared' => false]);

    $request = acRequestAs($user, "/catalog/attributes/{$attribute->id}", 'PUT', [
        'type' => 'text',
        'is_shared' => true,
    ]);

    acController()->update($request, $attribute);

    expect($attribute->fresh()->is_shared)->toBeTrue();
});
