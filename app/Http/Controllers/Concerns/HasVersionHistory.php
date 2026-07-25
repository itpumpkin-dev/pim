<?php

namespace App\Http\Controllers\Concerns;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * Version history for an auditable model, derived from its audit trail
 * (see App\Models\Concerns\Auditable). Each "created"/"updated" audit log
 * entry becomes one version, with a key/old-value/new-value diff built from
 * the logged attribute changes.
 */
trait HasVersionHistory
{
    protected function versionHistoryFor(Model $model): Collection
    {
        $logs = AuditLog::where('auditable_type', $model->getMorphClass())
            ->where('auditable_id', $model->getKey())
            ->whereIn('event', ['created', 'updated'])
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
                'created_at' => $log->created_at?->format('Y-m-d H:i:s'),
                'user' => $log->user ? ($log->user->name ?: $log->user->email) : 'System',
                'diff' => $diff,
            ];
        })->reverse()->values();
    }
}
