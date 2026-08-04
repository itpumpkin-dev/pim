<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use RuntimeException;

/**
 * Maps to n8n's `lazada_product_mapping` table — tracks which of our SKUs
 * already have a live Lazada listing (item_id/sku_id) per shop, so a push
 * can decide create vs. update. n8n owns this table; read-only here, same
 * as LazadaSellerAccount.
 */
class LazadaProductMapping extends Model
{
    protected $connection = 'n8n';

    protected $table = 'lazada_product_mapping';

    public $timestamps = false;

    protected static function booting(): void
    {
        parent::booting();

        static::saving(fn () => throw new RuntimeException('LazadaProductMapping is read-only — n8n owns lazada_product_mapping.'));
        static::deleting(fn () => throw new RuntimeException('LazadaProductMapping is read-only — n8n owns lazada_product_mapping.'));
    }
}
