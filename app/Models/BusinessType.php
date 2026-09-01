<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * "ประเภทธุรกิจ" (Business Types) master row.
 * Maintained on /catalog/business-types (see BusinessTypeController).
 */
class BusinessType extends Model
{
    protected $fillable = [
        'code',
        'name',
        'description',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
