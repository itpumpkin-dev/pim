<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Local cache of Lazada's category attribute schema (name, label,
 * input_type, attribute_type), deduped globally by `name` across every
 * category synced — see LazadaAttributeMappingController::syncLazadaAttributes().
 * Keyed by `name` rather than a numeric id — see the creating migration's
 * docblock for why.
 */
class LazadaAttribute extends Model
{
    protected $table = 'lazada_attributes';

    protected $primaryKey = 'name';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'label',
        'input_type',
        'attribute_type',
    ];
}
