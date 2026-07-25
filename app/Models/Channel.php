<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Channel extends Model
{
    use Auditable;

    protected $with = ['translations'];

    protected $appends = ['name'];

    protected function name(): \Illuminate\Database\Eloquent\Casts\Attribute
    {
        return \Illuminate\Database\Eloquent\Casts\Attribute::make(
            get: function () {
                if (!$this->relationLoaded('translations')) {
                    return null;
                }

                $localeId = Locale::where('code', app()->getLocale())->value('id');
                if ($localeId) {
                    $translation = $this->translations->firstWhere('locale_id', $localeId);
                    if ($translation && !empty(trim((string) $translation->name))) {
                        return $translation->name;
                    }
                }

                $fallback = $this->translations->first(fn (ChannelTranslation $t) => !empty(trim((string) $t->name)));
                return $fallback?->name;
            }
        );
    }

    protected $fillable = [
        'code',
        'root_category_id',
        'created_by',
        'updated_by',
    ];

    public function rootCategory(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'root_category_id');
    }

    public function locales(): BelongsToMany
    {
        return $this->belongsToMany(Locale::class, 'channel_locale');
    }

    public function currencies(): BelongsToMany
    {
        return $this->belongsToMany(Currency::class, 'channel_currency');
    }

    public function translations(): HasMany
    {
        return $this->hasMany(ChannelTranslation::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
