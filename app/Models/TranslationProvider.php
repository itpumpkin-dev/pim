<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class TranslationProvider extends Model
{
    use Auditable;

    protected static array $auditExcluded = ['credentials'];

    protected $fillable = [
        'type',
        'name',
        'credentials',
        'enabled',
        'is_default',
    ];

    protected $casts = [
        'credentials' => 'encrypted:array',
        'enabled' => 'boolean',
        'is_default' => 'boolean',
    ];

    protected $hidden = [
        'credentials',
    ];
}
