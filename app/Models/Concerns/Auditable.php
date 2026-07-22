<?php

namespace App\Models\Concerns;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;

/**
 * Records create/update/delete events for the model into audit_logs.
 *
 * Models may define a static $auditExcluded array to keep sensitive
 * attributes (e.g. password hashes) out of the logged values.
 */
trait Auditable
{
    public static function bootAuditable(): void
    {
        static::created(function (Model $model) {
            AuditLog::record('created', $model, null, static::auditableAttributes($model, $model->getAttributes()));
        });

        static::updated(function (Model $model) {
            $changes = static::auditableAttributes($model, $model->getChanges());
            unset($changes['updated_at']);

            if (empty($changes)) {
                return;
            }

            $original = static::auditableAttributes($model, Arr::only($model->getOriginal(), array_keys($changes)));

            AuditLog::record('updated', $model, $original, $changes);
        });

        static::deleted(function (Model $model) {
            AuditLog::record('deleted', $model, static::auditableAttributes($model, $model->getAttributes()), null);
        });
    }

    protected static function auditableAttributes(Model $model, array $attributes): array
    {
        $excluded = property_exists($model, 'auditExcluded')
            ? $model::$auditExcluded
            : ['password', 'password_hash', 'remember_token'];

        return Arr::except($attributes, $excluded);
    }
}
