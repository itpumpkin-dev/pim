<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Cache;

class Attribute extends Model
{
    use Auditable, SoftDeletes;

    protected $with = ['translations'];

    protected function name(): \Illuminate\Database\Eloquent\Casts\Attribute
    {
        return \Illuminate\Database\Eloquent\Casts\Attribute::make(
            get: function ($value) {
                if ($this->relationLoaded('translations')) {
                    $localeId = \App\Models\Locale::idForCode(app()->getLocale());
                    if ($localeId) {
                        $translation = $this->translations->firstWhere('locale_id', $localeId);
                        if ($translation && !empty(trim((string) $translation->label))) {
                            return $translation->label;
                        }
                    }
                }
                return $value;
            }
        );
    }

    protected $fillable = [
        'code',
        'name',
        'type',
        'swatch_type',
        'is_required',
        'is_unique',
        'is_locale_based',
        'is_ai_translate',
        'is_channel_based',
        'is_filterable',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_required' => 'boolean',
            'is_unique' => 'boolean',
            'is_locale_based' => 'boolean',
            'is_ai_translate' => 'boolean',
            'is_channel_based' => 'boolean',
            'is_filterable' => 'boolean',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function options(): HasMany
    {
        // Without an explicit order, Postgres has no guaranteed row order
        // (unlike MySQL's incidental primary-key ordering), so every select
        // dropdown built from this relation was showing options in an
        // effectively arbitrary order instead of the intended sort_order
        // sequence used for reordering them in the admin UI.
        return $this->hasMany(AttributeOption::class)->orderBy('sort_order');
    }

    public function families(): BelongsToMany
    {
        return $this->belongsToMany(AttributeFamily::class, 'family_attributes', 'attribute_id', 'family_id')
            ->using(FamilyAttribute::class)
            ->withPivot('attribute_group_id', 'sort_order')
            ->orderByPivot('sort_order');
    }

    public function values(): HasMany
    {
        return $this->hasMany(ProductValue::class);
    }

    public function translations(): HasMany
    {
        return $this->hasMany(AttributeTranslation::class);
    }

    private const CODE_MAP_VERSION_KEY = 'attributes:code_map:version';

    /**
     * Cached code => id lookup, for the many call sites that only need an
     * attribute's id (e.g. resolving 'pname'/'price'/'qty' to a column id
     * for a query) and previously ran a fresh `where('code', ...)->value('id')`
     * query on every request. `code` is immutable after creation (see
     * CodeGenerator::createWithRetry in AttributeController::store()), so
     * only create/delete need to invalidate this — see bumpCodeMapVersion().
     */
    public static function idForCode(string $code): ?int
    {
        return static::codeToIdMap()[$code] ?? null;
    }

    public static function codeToIdMap(): array
    {
        return Cache::rememberForever(
            'attributes.code_to_id:v'.static::codeMapVersion(),
            fn () => static::query()->pluck('id', 'code')->all()
        );
    }

    public static function codeMapVersion(): int
    {
        return (int) Cache::get(self::CODE_MAP_VERSION_KEY, 1);
    }

    /**
     * Call after creating or deleting an attribute (see
     * AttributeController::store()/destroy()) so idForCode()/codeToIdMap()
     * stop serving a stale set of codes.
     */
    public static function bumpCodeMapVersion(): void
    {
        Cache::forever(self::CODE_MAP_VERSION_KEY, self::codeMapVersion() + 1);
    }

    private const LIST_VERSION_KEY = 'attributes:list:version';

    /**
     * Cached id/code/name/type/is_filterable list for every attribute —
     * used by ProductController::index() for the grid's per-row
     * attribute_values map and "Add Filter" dropdown, previously re-queried
     * on every grid page/sort/filter/search. Unlike codeToIdMap() above,
     * name/type/is_filterable can change on update (not just create/
     * delete), so update() also bumps this — see
     * AttributeController::store()/update()/destroy().
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'attributes.list:v'.static::listVersion(),
            fn () => static::orderBy('code')->get(['id', 'code', 'name', 'type', 'is_filterable'])
        );
    }

    public static function listVersion(): int
    {
        return (int) Cache::get(self::LIST_VERSION_KEY, 1);
    }

    public static function bumpListVersion(): void
    {
        Cache::forever(self::LIST_VERSION_KEY, self::listVersion() + 1);
    }
}
