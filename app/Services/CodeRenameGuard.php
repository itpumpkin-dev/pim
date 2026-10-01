<?php

namespace App\Services;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Shared gate for renaming a record's `code` from its admin edit page.
 *
 * Each resource gets its own `{resource}.edit_code` permission (declared in
 * PermissionCatalog::addControllerEnforcedPermissions — it rides on the
 * resource's regular update route, so the route scan can't discover it).
 * Codes are lookup keys elsewhere in the app (import configs, marketplace
 * generators, hard-coded system codes…), so renaming is riskier than a normal
 * edit; callers pass the codes the app depends on as $lockedCodes, and cascade
 * string references themselves once resolve() returns a new code.
 */
class CodeRenameGuard
{
    /**
     * Same character set CodeGenerator produces plus what existing data already
     * uses (uppercase category codes like "L001", "…-copy_1" duplicates).
     */
    public const PATTERN = '/^[A-Za-z0-9_-]+$/';

    /**
     * @param  array<int, string>  $lockedCodes
     */
    public static function isLocked(?string $currentCode, array $lockedCodes = []): bool
    {
        return $currentCode !== null && in_array($currentCode, $lockedCodes, true);
    }

    /**
     * @param  array<int, string>  $lockedCodes
     */
    public static function canEdit(string $resource, ?string $currentCode = null, array $lockedCodes = []): bool
    {
        return (auth()->user()?->hasPermission($resource, 'edit_code') ?? false)
            && ! self::isLocked($currentCode, $lockedCodes);
    }

    /**
     * The new code when the request changes it, or null when it's absent or
     * unchanged (edit forms always send the current code back, so that must
     * keep working for users without the permission). Aborts 403 when the
     * user may not rename it; throws ValidationException when the new code is
     * malformed or taken.
     *
     * @param  array<int, string>  $lockedCodes  current codes that may never be renamed
     * @param  callable(\Illuminate\Validation\Rules\Unique): mixed|null  $uniqueScope  narrows the unique check (e.g. per parent)
     * @param  array<int, string>  $reservedCodes  codes nothing may be renamed *to* (keys the app already uses for something else)
     */
    public static function resolve(
        Request $request,
        Model $model,
        string $resource,
        array $lockedCodes = [],
        int $maxLength = 100,
        ?callable $uniqueScope = null,
        string $input = 'code',
        array $reservedCodes = [],
    ): ?string {
        if (! $request->filled($input)) {
            return null;
        }

        $newCode = trim((string) $request->input($input));
        if ($newCode === $model->getAttribute('code')) {
            return null;
        }

        abort_unless(
            self::canEdit($resource, $model->getAttribute('code'), $lockedCodes),
            403,
            'You do not have permission to change this code.',
        );

        $unique = Rule::unique($model->getTable(), 'code')->ignore($model->getKey());
        if ($uniqueScope) {
            $uniqueScope($unique);
        }

        Validator::make(
            [$input => $newCode],
            [$input => ['required', 'string', "max:{$maxLength}", 'regex:'.self::PATTERN, Rule::notIn($reservedCodes), $unique]],
            [
                $input.'.regex' => 'The code may only contain letters, numbers, underscores (_) and dashes (-).',
                $input.'.not_in' => 'This code is reserved by the system.',
            ],
        )->validate();

        return $newCode;
    }
}
