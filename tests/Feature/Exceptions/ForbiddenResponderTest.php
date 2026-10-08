<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia;

/**
 * A 403 for a signed-in user: an in-app (Inertia) visit bounces back with a
 * red toast; a full page load renders the themed errors/forbidden page; JSON
 * callers keep the plain 403.
 */
beforeEach(function () {
    // EnsureFreshPermissions logs out a session whose permissions_version
    // doesn't match the user's
    $user = User::factory()->create()->fresh();
    $this->actingAs($user)->withSession(['permissions_version' => $user->permissions_version]);
});

function frInertiaHeaders(array $extra = []): array
{
    // A missing/stale X-Inertia-Version gets a 409 asset-refresh instead.
    $version = app(HandleInertiaRequests::class)->version(Request::create('/'));

    return ['X-Inertia' => 'true', 'X-Inertia-Version' => (string) $version] + $extra;
}

test('an inertia visit to a forbidden page bounces back with an error flash', function () {
    $this->withHeaders(frInertiaHeaders(['Referer' => url('/dashboard?tab=x')]))
        ->get('/catalog/products')
        ->assertStatus(303)
        ->assertRedirect(url('/dashboard?tab=x'))
        ->assertSessionHas('error', __('messages.forbidden'));
});

test('a bounce never loops back onto the forbidden url itself', function () {
    $this->withHeaders(frInertiaHeaders(['Referer' => url('/catalog/products')]))
        ->get('/catalog/products')
        ->assertRedirect(route('dashboard'));
});

test('a prefetch does not plant a flash', function () {
    $this->withHeaders(frInertiaHeaders(['Purpose' => 'prefetch']))
        ->get('/catalog/products')
        ->assertForbidden()
        ->assertSessionMissing('error');
});

test('a full page load renders the themed forbidden page with status 403', function () {
    $this->get('/catalog/products')
        ->assertForbidden()
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('errors/forbidden', false)
            ->where('message', __('messages.forbidden')));
});

test('json callers keep the plain 403', function () {
    $this->getJson('/catalog/products')->assertForbidden()->assertJsonStructure(['message']);
});
