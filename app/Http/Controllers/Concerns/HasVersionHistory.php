<?php

namespace App\Http\Controllers\Concerns;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * Version history for an auditable model, derived from its audit trail
 * (see App\Models\Concerns\Auditable). Every audit log entry for this model
 * becomes one version, with a key/old-value/new-value diff built from the
 * logged attribute changes — not just the "created"/"updated" events fired
 * automatically by the Auditable trait, but also whatever domain-specific
 * events a controller records explicitly (e.g. ProductController's
 * `attribute_values_updated`, `published_shops_updated`, `pushed_to_lazada`;
 * AttributeOptionController's `option_created`/`option_updated`). Excluding
 * those here would mean most real edits never show up in the History tab,
 * since for several entities the bulk of saves only ever produce those
 * domain-specific events rather than a plain "updated".
 */
trait HasVersionHistory
{
    protected function versionHistoryFor(Model $model): Collection
    {
        $logs = AuditLog::where('auditable_type', $model->getMorphClass())
            ->where('auditable_id', $model->getKey())
            ->orderBy('created_at')
            ->with('user:id,first_name,last_name,email')
            ->get();

        return $logs->values()->map(function (AuditLog $log, int $index) {
            $old = $log->old_values ?? [];
            $new = $log->new_values ?? [];
            $keys = array_unique(array_merge(array_keys($old), array_keys($new)));

            $diff = collect($keys)->map(fn ($key) => [
                'key' => $key,
                'old' => $old[$key] ?? null,
                'new' => $new[$key] ?? null,
            ])->values();

            return [
                'version' => $index + 1,
                'event' => $log->event,
                // ISO 8601 with an explicit UTC offset (not a naive
                // "Y-m-d H:i:s" string) so the frontend can localize it to
                // the viewer's timezone instead of displaying the raw UTC
                // clock reading as if it were already local time.
                'created_at' => $log->created_at?->toIso8601String(),
                'user' => $log->user ? ($log->user->name ?: $log->user->email) : 'System',
                'diff' => $diff,
            ];
        })->reverse()->values();
    }
}
