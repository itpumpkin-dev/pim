<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * DB-backed mirror of one resources/js/locales/{locale}/{namespace}.json file.
 * Source of truth for every non-English locale; English stays file-only
 * (dev-authored, git-tracked) — see LocaleTranslationService::SOURCE_LOCALE.
 * Not Auditable: a single translate run can touch hundreds of rows and would
 * flood the audit log with machine-generated string diffs.
 */
class LocaleTranslationFile extends Model
{
    protected $fillable = [
        'locale_code',
        'namespace',
        'content',
    ];

    protected $casts = [
        'content' => 'array',
    ];
}
