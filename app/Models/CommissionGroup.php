<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * "กลุ่มคอมมิชชั่น" (Commission Groups) master row.
 * Maintained on /catalog/commission-groups (see CommissionGroupController).
 */
class CommissionGroup extends Model
{
    protected $fillable = [
        'code',
        'p_group_name',
        'divisor_start',
        'divisor_secondary',
        'start_date',
        'end_date',
        'is_active',
        'remark',
    ];

    protected function casts(): array
    {
        return [
            'divisor_start' => 'decimal:2',
            'divisor_secondary' => 'decimal:2',
            // See Point::casts() — explicit Y-m-d format so both DB reads
            // and Inertia's JSON props serialize as a plain date string.
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'is_active' => 'boolean',
        ];
    }
}
