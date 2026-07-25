<?php

namespace App\Services\ImportExport;

use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

class SpreadsheetWriter
{
    /**
     * @param array<int, string> $columns
     * @param iterable<array<string, mixed>> $rows
     */
    public static function write(string $absolutePath, string $format, array $columns, iterable $rows, string $separator = ','): void
    {
        if ($format === 'csv') {
            self::writeCsv($absolutePath, $columns, $rows, $separator);
            return;
        }

        self::writeSpreadsheet($absolutePath, $format, $columns, $rows);
    }

    private static function writeCsv(string $path, array $columns, iterable $rows, string $separator): void
    {
        $handle = fopen($path, 'w');
        if ($handle === false) {
            throw new \RuntimeException("Unable to write file: {$path}");
        }

        fputcsv($handle, $columns, $separator);

        foreach ($rows as $row) {
            $line = [];
            foreach ($columns as $col) {
                $line[] = $row[$col] ?? '';
            }
            fputcsv($handle, $line, $separator);
        }

        fclose($handle);
    }

    private static function writeSpreadsheet(string $path, string $format, array $columns, iterable $rows): void
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();

        foreach ($columns as $i => $col) {
            $sheet->setCellValue([$i + 1, 1], $col);
        }

        $rowIndex = 2;
        foreach ($rows as $row) {
            foreach ($columns as $i => $col) {
                $sheet->setCellValue([$i + 1, $rowIndex], $row[$col] ?? '');
            }
            $rowIndex++;
        }

        $writerType = $format === 'xls' ? 'Xls' : 'Xlsx';
        $writer = IOFactory::createWriter($spreadsheet, $writerType);
        $writer->save($path);
    }
}
