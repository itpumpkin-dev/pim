<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * "คะแนน" (Points) master row — a point type and its ratio/divisor.
 * Maintained on /catalog/points (see PointController).
 */
class Point extends Model
{
    protected $fillable = [
        'point_type',
        'point_ratio',
        'start_date',
        'end_date',
        'is_active',
        'remark',
    ];

    protected function casts(): array
    {
        return [
            'point_ratio' => 'decimal:2',
            // Explicit Y-m-d format — both DB reads and Inertia's JSON props
            // serialize as a plain date string, matching what an
            // <input type="date"> expects, with no manual formatting needed
            // at each call site.
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'is_active' => 'boolean',
        ];
    }
}
