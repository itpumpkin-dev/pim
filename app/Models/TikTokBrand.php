<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Local cache of TikTok Shop's brand list — see
 * SyncTikTokBrandsJob/BrandController::syncTiktokBrands() for how this is
 * populated from TikTokClient::getBrands() (called without a category_id,
 * so this is the shop's whole brand list, not scoped to any category).
 * Flat shape like LazadaBrand — no category_id.
 */
class TikTokBrand extends Model
{
    // Laravel's snake-case table-name guess splits "TikTok" into "tik_tok"
    // (each capital treated as a new word) — same mismatch WooCommerceBrand/
    // WooCommerceCategory work around.
    protected $table = 'tiktok_brands';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
    ];
}
