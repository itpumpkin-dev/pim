<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Local cache of TikTok's category attribute schema (id, name,
 * is_customizable, is_multiple_selection), deduped globally by `id` across
 * every category synced — see TikTokAttributeMappingController::
 * syncTikTokAttributes(). `id` is a string (TikTok's own attribute id) —
 * see the creating migration's docblock for the cross-category-uniqueness
 * caveat.
 */
class TikTokAttribute extends Model
{
    protected $table = 'tiktok_attributes';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'is_customizable',
        'is_multiple_selection',
    ];

    protected $casts = [
        'is_customizable' => 'boolean',
        'is_multiple_selection' => 'boolean',
    ];
}
