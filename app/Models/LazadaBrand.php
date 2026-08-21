<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Local cache of Lazada's global brand list — see
 * SyncLazadaBrandsJob/BrandController::syncLazadaBrands() for how this is
 * populated from LazadaClient::queryBrands(). Flatter than ShopeeBrand — no
 * category_id, since Lazada's brand endpoint isn't scoped to any category
 * (confirmed live: it's a single flat list of 150k+ brands system-wide).
 */
class LazadaBrand extends Model
{
    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
    ];
}
