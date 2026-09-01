<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Currency extends Model
{
    use Auditable;

    public $timestamps = false;

    protected $fillable = [
        'code',
        'name',
    ];

    public function channels(): BelongsToMany
    {
        return $this->belongsToMany(Channel::class, 'channel_currency');
    }

    public function vendors(): HasMany
    {
        return $this->hasMany(Vendor::class);
    }
}
