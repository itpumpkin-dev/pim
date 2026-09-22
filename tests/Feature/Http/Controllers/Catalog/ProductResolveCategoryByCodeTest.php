<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Category;
use Illuminate\Http\Request;

/**
 * "Edit this product group" button on the products/edit.tsx Master Categories
 * panel — the panel only holds the selected category CODE (mirrored from
 * categories.code into an AttributeOption row, per ProductCategoryLinker),
 * not the real Category id the /catalog/product-groups/{id}/edit route needs.
 * resolveCategoryByCode() bridges that gap.
 */
function prcbController(): ProductController
{
    return app(ProductController::class);
}

test('resolveCategoryByCode() returns the matching category id', function () {
    $category = Category::create(['code' => 'prcb_'.uniqid(), 'name' => 'Some Group']);

    $response = prcbController()->resolveCategoryByCode(Request::create('/', 'GET', ['code' => $category->code]));
    $payload = json_decode($response->getContent(), true);

    expect($response->getStatusCode())->toBe(200);
    expect($payload['id'])->toBe($category->id);
});

test('resolveCategoryByCode() returns 404 with a null id for a code that matches nothing', function () {
    $response = prcbController()->resolveCategoryByCode(Request::create('/', 'GET', ['code' => 'no_such_code_'.uniqid()]));
    $payload = json_decode($response->getContent(), true);

    expect($response->getStatusCode())->toBe(404);
    expect($payload['id'])->toBeNull();
});

test('resolveCategoryByCode() rejects a missing code with a validation error', function () {
    expect(fn () => prcbController()->resolveCategoryByCode(Request::create('/', 'GET', [])))
        ->toThrow(\Illuminate\Validation\ValidationException::class);
});
