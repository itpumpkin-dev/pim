<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WooConversion extends Model
{
    protected $fillable = [
        'original_filename',
        'row_count',
        'sku_missing_count',
        'category_matched_count',
        'category_unmatched_count',
        'brand_new_count',
        'brand_new_names',
        'brand_new_names_total',
        'type_warnings',
        'type_warnings_total',
        'emitted_name',
        'emitted_description',
        'has_unmatched',
        'family_code',
        'converted_file_path',
        'unmatched_file_path',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'row_count' => 'integer',
            'sku_missing_count' => 'integer',
            'category_matched_count' => 'integer',
            'category_unmatched_count' => 'integer',
            'brand_new_count' => 'integer',
            'brand_new_names' => 'array',
            'brand_new_names_total' => 'integer',
            'type_warnings' => 'array',
            'type_warnings_total' => 'integer',
            'emitted_name' => 'boolean',
            'emitted_description' => 'boolean',
            'has_unmatched' => 'boolean',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
