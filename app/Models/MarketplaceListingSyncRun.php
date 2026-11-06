<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One listing sync of one shop (phase 4A) — written by
 * MarketplaceListingSyncRunner, shown on the Product Matching page.
 */
class MarketplaceListingSyncRun extends Model
{
    public const TRIGGER_SCHEDULE = 'schedule';

    public const TRIGGER_MANUAL = 'manual';

    public const TRIGGER_COMMAND = 'command';

    public const TRIGGERS = [self::TRIGGER_SCHEDULE, self::TRIGGER_MANUAL, self::TRIGGER_COMMAND];

    public const STATUS_RUNNING = 'running';

    public const STATUS_SUCCESS = 'success';

    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'sales_platform_shop_id',
        'trigger',
        'status',
        'started_at',
        'finished_at',
        'duration_ms',
        'stats',
        'error',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'duration_ms' => 'integer',
        'stats' => 'array',
    ];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(SalesPlatformShop::class, 'sales_platform_shop_id');
    }
}
