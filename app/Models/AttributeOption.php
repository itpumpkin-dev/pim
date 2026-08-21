<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AttributeOption extends Model
{
    public $timestamps = false;

    protected $with = ['translations'];

    protected $fillable = [
        'attribute_id',
        'parent_id',
        'code',
        'admin_label',
        'slug',
        'description',
        'thumbnail',
        'swatch_value',
        'sort_order',
        'shopee_brand_id',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
        ];
    }

    /**
     * Resolves to the current locale's translated label when one exists,
     * falling back to the raw `admin_label` column otherwise — same
     * pattern as Attribute::name / AttributeGroup::name. Writes still go
     * straight to the raw column (no `set` closure), so every existing
     * caller (imports, batch edit) is unaffected.
     */
    protected function adminLabel(): \Illuminate\Database\Eloquent\Casts\Attribute
    {
        return \Illuminate\Database\Eloquent\Casts\Attribute::make(
            get: function ($value) {
                if ($this->relationLoaded('translations')) {
                    $localeId = Locale::idForCode(app()->getLocale());
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

    public function attribute(): BelongsTo
    {
        return $this->belongsTo(Attribute::class);
    }

    public function translations(): HasMany
    {
        return $this->hasMany(AttributeOptionTranslation::class);
    }

    /**
     * Self-referencing hierarchy (e.g. a Brand option's "Parent Brand") —
     * generic on the model like the other new columns above, even though
     * only the Brand pages expose it today.
     */
    public function parentOption(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function childOptions(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function shopeeBrand(): BelongsTo
    {
        return $this->belongsTo(ShopeeBrand::class, 'shopee_brand_id');
    }
}
