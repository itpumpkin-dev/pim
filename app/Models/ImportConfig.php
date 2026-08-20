<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ImportConfig extends Model
{
    use Auditable;

    protected $fillable = [
        'code',
        'type',
        'file_format',
        'field_separator',
        'action',
        'validation_strategy',
        'ai_translate',
        'source_locale',
        'allowed_errors',
        'image_directory_path',
        'source_file_path',
        'source_file_name',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'allowed_errors' => 'integer',
            'ai_translate' => 'boolean',
        ];
    }

    public function jobs(): HasMany
    {
        return $this->hasMany(JobTracker::class, 'import_config_id');
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
