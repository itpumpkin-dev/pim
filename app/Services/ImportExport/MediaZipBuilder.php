<?php

namespace App\Services\ImportExport;

use Illuminate\Support\Facades\Storage;
use ZipArchive;

class MediaZipBuilder
{
    /**
     * Bundles the data file plus any referenced media into a zip. Media
     * files live on the 'public' disk (where product uploads are stored);
     * unreadable/missing paths are skipped rather than failing the export.
     *
     * @param iterable<string> $mediaPaths relative paths on the 'public' disk
     */
    public static function build(string $zipAbsolutePath, string $dataFileAbsolutePath, string $dataFileNameInZip, iterable $mediaPaths): void
    {
        $zip = new ZipArchive();
        if ($zip->open($zipAbsolutePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException("Unable to create zip archive: {$zipAbsolutePath}");
        }

        $zip->addFile($dataFileAbsolutePath, $dataFileNameInZip);

        $seen = [];
        foreach ($mediaPaths as $path) {
            if (isset($seen[$path]) || !Storage::disk('public')->exists($path)) {
                continue;
            }
            $seen[$path] = true;
            $zip->addFile(Storage::disk('public')->path($path), 'media/'.basename($path));
        }

        $zip->close();
    }
}
