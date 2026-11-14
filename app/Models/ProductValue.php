<?php

namespace App\Models;

use App\Services\Catalog\LocaleFallback;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductValue extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'product_id',
        'attribute_id',
        'attribute_group_id',
        'channel_id',
        'locale_id',
        'value',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function attribute(): BelongsTo
    {
        return $this->belongsTo(Attribute::class);
    }

    public function attributeGroup(): BelongsTo
    {
        return $this->belongsTo(AttributeGroup::class);
    }

    public function channel(): BelongsTo
    {
        return $this->belongsTo(Channel::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }

    /**
     * แถวของภาษาที่ขอ + ภาษาหลัก (th) + แถว NULL เรียงตามลำดับ fallback — `->first()`/`->value()`
     * ได้ค่าที่ถูกต้องตาม LocaleFallback ใช้กับ query ที่จำกัด product/attribute/scope ไว้แล้ว
     */
    public function scopeInLocale(Builder $query, ?int $localeId): Builder
    {
        $chain = LocaleFallback::chain($localeId);
        [$orderSql, $bindings] = LocaleFallback::orderBy($localeId, $query->qualifyColumn('locale_id'));

        return $query
            ->where(fn (Builder $q) => $q->whereIn($q->qualifyColumn('locale_id'), $chain)->orWhereNull($q->qualifyColumn('locale_id')))
            ->orderByRaw($orderSql, $bindings);
    }
}
