<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use Illuminate\Support\Facades\Storage;

class AttributeValueFormatter
{
    /**
     * Converts a raw stored attribute value into its public-facing form —
     * image/file/video/gallery values are stored as paths relative to the
     * 'public' disk (see ProductController's upload handling) and need a URL
     * built against that specific disk to become fetchable.
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

            return array_map(fn ($path) => self::resolveStorageUrl($path), $paths);
        }

        if (in_array($attribute->type, ['image', 'file', 'video'], true)) {
            return self::resolveStorageUrl($rawValue);
        }

        return $rawValue;
    }

    /**
     * Builds a public URL for a stored image/file/video/gallery value —
     * except when it's already an absolute URL, which happens for rows
     * brought in via import (e.g. a WooCommerce-converted CSV's `pimage`
     * column carries the original external image URL, never downloaded
     * into local storage). Running that through Storage::url() would nest
     * it under this app's own /storage/ prefix and break it, so pass
     * already-absolute values through unchanged.
     */
    public static function resolveStorageUrl(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        return Storage::disk('public')->url($path);
    }
}
