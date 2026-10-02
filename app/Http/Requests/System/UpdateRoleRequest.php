<?php

namespace App\Http\Requests\System;

use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;
use Illuminate\Validation\Rule;

class UpdateRoleRequest extends FormRequest
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
        $role = $this->route('role');

        return [
            'label' => ['required', 'string', 'max:100', Rule::unique('roles', 'label')->ignore($role->id)],
            'is_guest' => ['boolean'],
            'is_active' => ['required', 'boolean'],

            'permissions' => ['array'],
            'permissions.*' => ['array'],
            'permissions.*.*' => ['string'],

            'users' => ['array'],
            'users.*' => ['integer', 'exists:users,id'],

            'shop_ids' => ['array'],
            'shop_ids.*' => ['integer', 'exists:sales_platform_shops,id'],

            'restricted_platforms' => ['array'],
            'restricted_platforms.*' => ['integer', 'exists:sales_platforms,id'],
        ];
    }

    /**
     * A role's status is enforced (inactive roles grant nothing), so two
     * roles must stay active: Administrator, or admins could lock themselves
     * out; and the guest role, since without an active guest role anonymous
     * visitors fall back to unrestricted access (Role::guest()).
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($this->boolean('is_active')) {
                    return;
                }
                if ($this->boolean('is_guest')) {
                    $validator->errors()->add('is_active', 'The guest role must stay active.');
                }
                if ($this->route('role')?->label === Role::ADMINISTRATOR_LABEL || $this->input('label') === Role::ADMINISTRATOR_LABEL) {
                    $validator->errors()->add('is_active', 'The Administrator role cannot be deactivated.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return [
            'code.regex' => 'The code may only contain letters, numbers, underscores (_) and dashes (-).',
        ];
    }
}
