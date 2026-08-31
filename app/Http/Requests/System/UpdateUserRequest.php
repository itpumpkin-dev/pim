<?php

namespace App\Http\Requests\System;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UpdateUserRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $user = $this->route('user');

        return [
            'name_prefix' => ['nullable', 'string', 'max:50'],
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:10'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', Rule::unique(\App\Models\User::class)->ignore($user->id)],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'job_position_id' => ['nullable', 'integer', 'exists:job_positions,id'],
            'manager_id' => [
                'nullable',
                'integer',
                'exists:users,id',
                // No self-reference and no loop: the chosen manager must not
                // be this user, nor anyone who already reports (directly or
                // indirectly) to this user.
                function ($attribute, $value, $fail) use ($user) {
                    if ($user === null || $value === null) {
                        return;
                    }

                    if ((int) $value === (int) $user->id) {
                        $fail('A user cannot report to themselves.');

                        return;
                    }

                    if (in_array((int) $value, $user->descendantIds(), true)) {
                        $fail('That user reports to this one — choosing them as manager would create a loop.');
                    }
                },
            ],
            'enabled' => ['required', 'boolean'],
            'avatar' => ['nullable', 'image', 'max:2048'],

            // Group/role assignments are saved separately — see
            // UserController::updateAccess() and the "Groups and Roles" tab.

            'password' => ['nullable', 'confirmed', Password::defaults()],

            'ui_locale_id' => ['nullable', 'integer', 'exists:locales,id'],
            'timezone' => ['required', 'string', Rule::in(timezone_identifiers_list())],
        ];
    }
}
