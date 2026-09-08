<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One PIM AttributeOption <-> Lazada option-value pairing, scoped to a
 * specific LazadaAttributeMapping (i.e. a specific "this PIM attribute feeds
 * that Lazada select-type attribute" choice) — see the creating migration's
 * docblock. Read by LazadaProductSyncService::resolveMappedAttributes() to
 * translate a product's stored AttributeOption code into the value Lazada's
 * schema actually expects for singleSelect/multiSelect/enumInput/
 * multiEnumInput attributes.
 *
 * `lazada_option_label` (added by 2026_09_08_000004_add_label_to_
 * lazada_attribute_option_mappings_table) captures the option's display name
 * at the moment the admin picks it — needed specifically for the `brand`
 * field, whose name Lazada requires by catalog NAME, not id (confirmed
 * live). Looking that name up later from the shared, global
 * `lazada_attributes.options` cache was a real bug: that row gets
 * overwritten by every category's own sync, so a different category's later
 * sync could silently erase the option list this row's value was chosen
 * from. Storing the label here instead makes resolution independent of
 * whatever that cache currently holds.
 */
class LazadaAttributeOptionMapping extends Model
{
    use Auditable;

    protected $table = 'lazada_attribute_option_mappings';

    protected $fillable = [
        'lazada_attribute_mapping_id',
        'attribute_option_id',
        'lazada_option_value',
        'lazada_option_label',
        'created_by',
        'updated_by',
    ];

    public function lazadaAttributeMapping(): BelongsTo
    {
        return $this->belongsTo(LazadaAttributeMapping::class);
    }

    public function attributeOption(): BelongsTo
    {
        return $this->belongsTo(AttributeOption::class);
    }
}
