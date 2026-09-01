<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * "เวนเดอร์" (Vendor) master row.
 * Maintained on /catalog/vendors (see VendorController).
 */
class Vendor extends Model
{
    /** DefaultPriceTerm options shown on the create/edit form. */
    public const PRICE_TERMS = ['C&F', 'CIF', 'CNF', 'FOB', 'TNV', 'TVAT'];

    /** กลุ่มเวนเดอร์ options shown on the create/edit form. */
    public const VENDOR_GROUPS = ['domestic', 'foreign'];

    protected $fillable = [
        'code',
        'name',
        'name_en',
        'short_name',
        'vendor_group',
        'tax_id',
        'branch',
        'tax_invoice_address_1',
        'tax_invoice_address_2',
        'tax_invoice_address_3',
        'tax_invoice_address_4',
        'currency_id',
        'payment_terms',
        'default_price_term',
        'remark',
        'contact_name',
        'contact_position',
        'contact_phone',
        'contact_fax',
        'contact_email',
        'contact_address_1',
        'contact_address_2',
        'contact_address_3',
        'contact_address_4',
        'contact_country',
        'credit_term_days',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'credit_term_days' => 'integer',
        ];
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }
}
