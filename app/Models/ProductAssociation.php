<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductAssociation extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'owner_product_id',
        'associated_product_id',
        'association_type_id',
    ];

    public function ownerProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'owner_product_id');
    }

    public function associatedProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'associated_product_id');
    }

    public function associationType(): BelongsTo
    {
        return $this->belongsTo(AssociationType::class);
    }
}
