<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use RuntimeException;

/**
 * Maps to n8n's `lazada_tokens` table (separate Postgres instance, see the
 * 'n8n' connection in config/database.php). n8n workflows own this table —
 * they handle the OAuth flow and keep access_token fresh. This app only
 * ever reads a seller's current token to call Lazada's Open API; writes are
 * blocked below so a slip here can't fight n8n's own refresh cycle.
 */
class LazadaSellerAccount extends Model
{
    use SoftDeletes;

    protected $connection = 'n8n';

    protected $table = 'lazada_tokens';

    public $timestamps = false;

    protected $casts = [
        'is_active' => 'boolean',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    protected static function booting(): void
    {
        parent::booting();

        static::saving(fn () => throw new RuntimeException('LazadaSellerAccount is read-only — n8n owns lazada_tokens.'));
        static::deleting(fn () => throw new RuntimeException('LazadaSellerAccount is read-only — n8n owns lazada_tokens.'));
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
