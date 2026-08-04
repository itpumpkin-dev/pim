<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesPlatform extends Model
{
    use Auditable;

    protected $fillable = [
        'code',
        'name',
        'created_by',
        'updated_by',
    ];

    public function shops(): HasMany
    {
        return $this->hasMany(SalesPlatformShop::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
