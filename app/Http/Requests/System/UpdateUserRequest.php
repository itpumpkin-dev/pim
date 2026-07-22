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
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', Rule::unique(\App\Models\User::class)->ignore($user->id)],
            'enabled' => ['required', 'boolean'],
            'avatar' => ['nullable', 'image', 'max:2048'],

            'groups' => ['array'],
            'groups.*' => ['integer', 'exists:user_groups,id'],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['integer', 'exists:roles,id'],

            'password' => ['nullable', 'confirmed', Password::defaults()],

            'ui_locale_id' => ['nullable', 'integer', 'exists:locales,id'],
            'timezone' => ['required', 'string', Rule::in(timezone_identifiers_list())],
        ];
    }
}
