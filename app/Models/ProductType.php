<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * "ประเภทสินค้า" (Product Types) master row.
 * Maintained on /catalog/product-types (see ProductTypeController).
 */
class ProductType extends Model
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
