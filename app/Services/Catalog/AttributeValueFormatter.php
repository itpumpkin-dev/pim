<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use Illuminate\Support\Facades\Storage;

class AttributeValueFormatter
{
    /**
     * Converts a raw stored attribute value into its public-facing form —
     * image/file/gallery values are stored as paths relative to the 'public'
     * disk (see ProductController's upload handling) and need a URL built
     * against that specific disk to become fetchable.
     *
     * Deliberately not `Storage::url()` (the default-disk facade): that
     * resolves against whatever FILESYSTEM_DISK happens to be configured
     * (here, 'local', which isn't even the disk these files are stored on)
     * and — since the 'local' disk has no 'url' key — silently falls back to
     * a bare `/storage/...` path with no scheme or host. That's harmless for
     * same-origin browser rendering but useless to an external consumer like
     * the Lazada API, which needs an absolute, publicly-fetchable URL.
     */
    public static function format(Attribute $attribute, ?string $rawValue): mixed
    {
        if ($rawValue === null || $rawValue === '') {
            return null;
        }

        if ($attribute->type === 'gallery') {
            $paths = json_decode($rawValue, true) ?: [];

            return array_map(fn ($path) => Storage::disk('public')->url($path), $paths);
        }

        if (in_array($attribute->type, ['image', 'file'], true)) {
            return Storage::disk('public')->url($rawValue);
        }

        return $rawValue;
    }
}
