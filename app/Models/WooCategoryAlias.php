<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A remembered Category Mapping row (see WooCommerceConverter's
 * category_map_path option): once a WooCommerce "Categories" cell has been
 * manually resolved to pcatname/psubcatname/productgroupname codes, it's
 * saved here so every future conversion applies it automatically instead of
 * requiring the same mapping file to be re-uploaded each time.
 */
class WooCategoryAlias extends Model
{
    protected $fillable = [
        'match_key',
        'woo_category_text',
        'pcatname',
        'psubcatname',
        'productgroupname',
        'created_by',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
