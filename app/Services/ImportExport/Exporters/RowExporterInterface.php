<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\ExportConfig;

interface RowExporterInterface
{
    /**
     * @return array<int, string>
     */
    public function columns(): array;

    /**
     * @return \Generator<array<string, mixed>>
     */
    public function rows(ExportConfig $config): \Generator;
}
