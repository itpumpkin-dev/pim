<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Local cache of TikTok Shop's category tree — see CategoryController::
 * syncTikTokCategories() for how this is populated from
 * TikTokClient::getCategoryTree(). Mirrors ShopeeCategory/LazadaCategory.
 */
class TikTokCategory extends Model
{
    // Eloquent's default naming would infer `tik_tok_categories` — Str::
    // snake() splits "TikTok" on its capital K, not just before "Category"
    // — but the migration created `tiktok_categories` (matching
    // tiktok_category_id/tiktok_categories used throughout routes/
    // CategoryController), so this must be explicit.
    protected $table = 'tiktok_categories';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'parent_id',
        'name',
        'name_th',
        'is_leaf',
    ];

    protected $casts = [
        'is_leaf' => 'boolean',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }
}
