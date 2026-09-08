<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AttributeGroup extends Model
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
        // Non-null only on a group auto-generated for a marketplace sync
        // (currently just the shared "Lazada" group — see
        // LazadaAttributeFamilyGenerator::findOrCreateLazadaGroup()). Soft
        // reference to sales_platforms.code — purely a UI-organization
        // marker for role-form.tsx's "Platform Attribute Access" section,
        // not a new permission resource; AttributeAccessPolicy's
        // view_attribute_groups/edit_attribute_groups checks are unaffected.
        'platform',
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

    public function familyAttributes(): HasMany
    {
        return $this->hasMany(FamilyAttribute::class, 'attribute_group_id');
    }

    public function translations(): HasMany
    {
        return $this->hasMany(AttributeGroupTranslation::class);
    }
}
