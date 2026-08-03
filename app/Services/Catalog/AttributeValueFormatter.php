<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use Illuminate\Support\Facades\Storage;

class AttributeValueFormatter
{
    /**
     * Converts a raw stored attribute value into its public-facing form —
     * image/file/gallery values are stored as storage-relative paths and
     * need Storage::url() to become fetchable URLs.
     */
    public static function format(Attribute $attribute, ?string $rawValue): mixed
    {
        if ($rawValue === null || $rawValue === '') {
            return null;
        }

        if ($attribute->type === 'gallery') {
            $paths = json_decode($rawValue, true) ?: [];

            return array_map(fn ($path) => Storage::url($path), $paths);
        }

        if (in_array($attribute->type, ['image', 'file'], true)) {
            return Storage::url($rawValue);
        }

        return $rawValue;
    }
}
