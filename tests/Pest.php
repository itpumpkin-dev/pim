<?php

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(Tests\TestCase::class)
    ->use(Illuminate\Foundation\Testing\RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

function something()
{
    // ..
}

/**
 * Shared by the *MappingTimelineBuilderTest files — creates an AuditLog row
 * for $model with explicit old/new values, optionally backdated.
 *
 * Eloquent auto-stamps created_at on INSERT regardless of what's passed to
 * create() (AuditLog only nulls UPDATED_AT, not $timestamps), so a desired
 * $createdAt is applied via a separate UPDATE afterwards instead, which
 * Eloquent does not re-stamp.
 */
function logFor(object $model, string $event, ?array $old = null, ?array $new = null, ?\Illuminate\Support\Carbon $createdAt = null): \App\Models\AuditLog
{
    $log = \App\Models\AuditLog::create([
        'event' => $event,
        'auditable_type' => $model->getMorphClass(),
        'auditable_id' => $model->getKey(),
        'old_values' => $old,
        'new_values' => $new,
    ]);

    if ($createdAt !== null) {
        $log->forceFill(['created_at' => $createdAt])->save();
    }

    return $log;
}
