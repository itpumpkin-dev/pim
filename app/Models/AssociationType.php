<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AssociationType extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'code',
    ];

    public function associations(): HasMany
    {
        return $this->hasMany(ProductAssociation::class);
    }
}
