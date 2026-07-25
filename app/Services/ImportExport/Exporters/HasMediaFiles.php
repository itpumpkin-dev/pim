<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\ExportConfig;

/**
 * Implemented by exporters whose rows can reference stored media files
 * (image/file/gallery attribute values), so MediaZipBuilder knows what to
 * bundle alongside the data file when with_media is enabled.
 */
interface HasMediaFiles
{
    /**
     * @return iterable<string> relative paths on the 'public' disk
     */
    public function mediaPaths(ExportConfig $config): iterable;
}
