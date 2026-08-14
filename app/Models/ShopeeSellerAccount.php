<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use RuntimeException;

/**
 * Maps to n8n's `shopee_tokens` table (separate Postgres instance, see the
 * 'n8n' connection in config/database.php) — see LazadaSellerAccount for the
 * equivalent Lazada mapping. n8n workflows own this table; this app only
 * ever reads a shop's current token to call Shopee's API, writes are
 * blocked below so a slip here can't fight n8n's own refresh cycle.
 *
 * Unlike lazada_tokens: the primary key is shop_id (a Shopee-assigned
 * string, not an auto-increment int), there's no is_active/deleted_at
 * column, and auth fields use Shopee's own naming (partner_id/partner_key
 * instead of app_key/app_secret).
 */
class ShopeeSellerAccount extends Model
{
    protected $connection = 'n8n';

    protected $table = 'shopee_tokens';

    protected $primaryKey = 'shop_id';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected static function booting(): void
    {
        parent::booting();

        static::saving(fn () => throw new RuntimeException('ShopeeSellerAccount is read-only — n8n owns shopee_tokens.'));
        static::deleting(fn () => throw new RuntimeException('ShopeeSellerAccount is read-only — n8n owns shopee_tokens.'));
    }
}
