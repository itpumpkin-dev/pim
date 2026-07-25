<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExportConfig extends Model
{
    use Auditable;

    protected $fillable = [
        'code',
        'type',
        'file_format',
        'field_separator',
        'with_media',
        'result_file_path',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'with_media' => 'boolean',
        ];
    }

    public function jobs(): HasMany
    {
        return $this->hasMany(JobTracker::class, 'export_config_id');
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
