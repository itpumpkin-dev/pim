<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Locale extends Model
{
    use Auditable;

    public $timestamps = false;

    protected $fillable = [
        'code',
        'display_name',
        'enabled',
        'translation_status',
        'translation_total',
        'translation_translated',
        'translation_started_at',
        'translation_completed_at',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'translation_total' => 'integer',
        'translation_translated' => 'integer',
        'translation_started_at' => 'datetime',
        'translation_completed_at' => 'datetime',
    ];
}
