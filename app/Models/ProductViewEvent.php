<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductViewEvent extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'event_type',
        'product_id',
        'category',
        'user_id',
        'session_id',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Record a storefront click / category-select event for the current request.
     */
    public static function record(string $eventType, ?int $productId = null, ?string $category = null): self
    {
        return static::create([
            'event_type' => $eventType,
            'product_id' => $productId,
            'category' => $category,
            'user_id' => auth()->check() ? auth()->id() : null,
            'session_id' => session()->getId(),
            'created_at' => now(),
        ]);
    }
}
