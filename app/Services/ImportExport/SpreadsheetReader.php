<?php

namespace App\Services\ImportExport;

use PhpOffice\PhpSpreadsheet\IOFactory;

class SpreadsheetReader
{
    /**
     * Yields each data row as an associative array keyed by the header row.
     */
    public static function read(string $absolutePath, string $format, string $separator = ','): \Generator
    {
        if ($format === 'csv') {
            yield from self::readCsv($absolutePath, $separator);
            return;
        }

        yield from self::readSpreadsheet($absolutePath);
    }

    private static function readCsv(string $path, string $separator): \Generator
    {
        $handle = fopen($path, 'r');
        if ($handle === false) {
            throw new \RuntimeException("Unable to open file: {$path}");
        }

        $header = fgetcsv($handle, 0, $separator);
        if ($header === false) {
            fclose($handle);
            return;
        }
        $header = array_map(fn ($h) => trim((string) $h), $header);
        $count = count($header);

        while (($row = fgetcsv($handle, 0, $separator)) !== false) {
            $row = array_slice(array_pad($row, $count, null), 0, $count);
            yield array_combine($header, $row);
        }

        fclose($handle);
    }

    private static function readSpreadsheet(string $path): \Generator
    {
        $spreadsheet = IOFactory::load($path);
        $rows = $spreadsheet->getActiveSheet()->toArray(null, true, true, false);

        if (empty($rows)) {
            return;
        }

        $header = array_map(fn ($h) => trim((string) $h), array_shift($rows));
        $count = count($header);

        foreach ($rows as $row) {
            $row = array_slice(array_pad($row, $count, null), 0, $count);
            yield array_combine($header, $row);
        }
    }
}
