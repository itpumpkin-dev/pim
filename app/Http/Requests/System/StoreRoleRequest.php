<?php

namespace App\Http\Requests\System;

use Illuminate\Foundation\Http\FormRequest;

class StoreRoleRequest extends FormRequest
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
            'label' => ['required', 'string', 'max:100', 'unique:roles,label'],

            'permissions' => ['array'],
            'permissions.*' => ['array'],
            'permissions.*.*' => ['string'],

            'users' => ['array'],
            'users.*' => ['integer', 'exists:users,id'],
        ];
    }
}
