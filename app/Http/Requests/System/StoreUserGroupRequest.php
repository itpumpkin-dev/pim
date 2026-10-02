<?php

namespace App\Http\Requests\System;

use App\Services\CodeRenameGuard;
use Illuminate\Foundation\Http\FormRequest;

class StoreUserGroupRequest extends FormRequest
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
        return [
            // unique: checks soft-deleted groups too, matching the DB unique index.
            'code' => ['required', 'string', 'max:100', 'regex:'.CodeRenameGuard::PATTERN, 'unique:user_groups,code'],
            'name' => ['required', 'string', 'max:100', 'unique:user_groups,name'],
            'description' => ['required', 'string'],
            'is_active' => ['required', 'boolean'],

            'users' => ['array'],
            'users.*' => ['integer', 'exists:users,id'],

            'roles' => ['array'],
            'roles.*' => ['integer', 'exists:roles,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'code.regex' => 'The code may only contain letters, numbers, underscores (_) and dashes (-).',
        ];
    }
}
