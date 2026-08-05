<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class Locale extends Model
{
    use Auditable;

    public $timestamps = false;

    protected $fillable = [
        'code',
        'display_name',
        'enabled',
        'translation_status',
        'translation_total',
        'translation_translated',
        'translation_started_at',
        'translation_completed_at',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'translation_total' => 'integer',
        'translation_translated' => 'integer',
        'translation_started_at' => 'datetime',
        'translation_completed_at' => 'datetime',
    ];

    private static ?Collection $activeCache = null;

    private static ?array $codeToIdMap = null;

    protected static function booted(): void
    {
        $bust = function (): void {
            Cache::forget('locales.active');
            Cache::forget('locales.code_to_id');
            static::$activeCache = null;
            static::$codeToIdMap = null;
        };

        static::saved($bust);
        static::deleted($bust);
    }

    /**
     * Enabled locales, cached across the request (and, via the cache
     * store, across requests) so it isn't re-queried on every navigation
     * — see SetLocale and HandleInertiaRequests, which both need it.
     */
    public static function active(): Collection
    {
        return static::$activeCache ??= Cache::rememberForever(
            'locales.active',
            fn () => static::where('enabled', true)->orderBy('code')->get(['id', 'code', 'display_name'])
        );
    }

    /**
     * code => id for every locale (not just enabled ones), cached the
     * same way. Used to resolve a translation row's locale without a
     * fresh query per model instance — see the `name` accessors on
     * Attribute/AttributeGroup/AttributeFamily/Channel.
     */
    public static function codeToIdMap(): array
    {
        return static::$codeToIdMap ??= Cache::rememberForever(
            'locales.code_to_id',
            fn () => static::query()->pluck('id', 'code')->all()
        );
    }

    public static function idForCode(?string $code): ?int
    {
        return $code ? (static::codeToIdMap()[$code] ?? null) : null;
    }
}
