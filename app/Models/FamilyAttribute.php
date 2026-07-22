<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

class FamilyAttribute extends Pivot
{
    public $incrementing = false;
    public $timestamps = false;

    protected $table = 'family_attributes';

    protected $fillable = [
        'family_id',
        'attribute_id',
        'attribute_group_id',
    ];

    public function family(): BelongsTo
    {
        return $this->belongsTo(AttributeFamily::class, 'family_id');
    }

    public function attribute(): BelongsTo
    {
        return $this->belongsTo(Attribute::class);
    }

    public function attributeGroup(): BelongsTo
    {
        return $this->belongsTo(AttributeGroup::class);
    }
}
