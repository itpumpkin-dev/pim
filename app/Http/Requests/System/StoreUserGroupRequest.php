<?php

namespace App\Http\Requests\System;

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
            'name' => ['required', 'string', 'max:100', 'unique:user_groups,name'],
            'description' => ['required', 'string'],

            'users' => ['array'],
            'users.*' => ['integer', 'exists:users,id'],

            'roles' => ['array'],
            'roles.*' => ['integer', 'exists:roles,id'],
        ];
    }
}
