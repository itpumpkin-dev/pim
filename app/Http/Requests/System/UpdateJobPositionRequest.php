<?php

namespace App\Http\Requests\System;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateJobPositionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $jobPosition = $this->route('jobPosition');

        return [
            'name' => ['required', 'string', 'max:100', Rule::unique('job_positions', 'name')->ignore($jobPosition->id)],
            'enabled' => ['required', 'boolean'],
        ];
    }
}
