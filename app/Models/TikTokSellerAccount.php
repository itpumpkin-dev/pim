<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use RuntimeException;

/**
 * Maps to n8n's `tiktok_tokens` table (separate Postgres instance, see the
 * 'n8n' connection in config/database.php) — see LazadaSellerAccount for the
 * equivalent Lazada mapping. n8n workflows own this table; this app only
 * ever reads a seller's current token to call TikTok Shop's API, writes are
 * blocked below so a slip here can't fight n8n's own refresh cycle.
 *
 * Unlike lazada_tokens: no is_active column (so no ::active() scope — same
 * situation as ShopeeSellerAccount, filter in application code if needed),
 * and it carries shops_code/shops_cipher alongside open_id — TikTok Shop's
 * API requires shop_cipher on every shop-scoped call, not just the token.
 */
class TikTokSellerAccount extends Model
{
    protected $connection = 'n8n';

    protected $table = 'tiktok_tokens';

    public $timestamps = false;

    protected $casts = [
        'access_token_expires_at' => 'datetime',
        'refresh_token_expires_at' => 'datetime',
        'granted_scopes' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booting(): void
    {
        parent::booting();

        static::saving(fn () => throw new RuntimeException('TikTokSellerAccount is read-only — n8n owns tiktok_tokens.'));
        static::deleting(fn () => throw new RuntimeException('TikTokSellerAccount is read-only — n8n owns tiktok_tokens.'));
    }
}
