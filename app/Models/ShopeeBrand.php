<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Local cache of Shopee's brand list — see BrandController::syncShopeeBrands()
 * for how this is populated from ShopeeClient::getBrandList(). Unlike
 * get_category (one call, the whole tree), get_brand_list is scoped to one
 * category_id at a time, so a brand's `category_id` here is just "the
 * category it was last seen listed under" — informational, not a foreign
 * key, since the same brand can legitimately appear under several
 * categories. Mirrors ShopeeCategory's non-incrementing-PK shape.
 */
class ShopeeBrand extends Model
{
    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
        'category_id',
    ];
}
