<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Cache;

class AttributeFamily extends Model
{
    use Auditable;

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
        'created_by',
        'updated_by',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function attributes(): BelongsToMany
    {
        return $this->belongsToMany(Attribute::class, 'family_attributes', 'family_id', 'attribute_id')
            ->using(FamilyAttribute::class)
            ->withPivot('attribute_group_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'family_id');
    }

    public function translations(): HasMany
    {
        return $this->hasMany(AttributeFamilyTranslation::class);
    }

    private const LIST_VERSION_KEY = 'attribute_families:list:version';

    /**
     * Cached id/code/name list for every family — used by
     * ProductController::index() to populate the grid's family filter
     * dropdown, previously re-queried on every grid page/sort/filter.
     * Invalidated on family CRUD — see
     * AttributeFamilyController::store()/update()/destroy().
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'attribute_families.list:v'.static::listVersion(),
            fn () => static::select('id', 'code', 'name')->orderBy('name')->get()
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
