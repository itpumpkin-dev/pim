<?php

namespace App\Services\ImportExport\Importers;

use App\Models\ImportConfig;
use App\Services\ImportExport\RowImportException;

interface RowImporterInterface
{
    /**
     * Ordered list of column headers this importer understands (used both to
     * validate/read uploaded files and to build the sample template).
     *
     * @return array<int, string>
     */
    public function columns(): array;

    /**
     * code => localized display label, for every column columns() lists —
     * used as the sample template's header row, and to accept a label in
     * place of a code when reading an uploaded file back (see
     * RowHeaderNormalizer). Always keyed by the same codes columns() returns.
     *
     * @return array<string, string>
     */
    public function columnLabels(): array;

    /**
     * Subset of columns() that must be non-empty for a row to import
     * successfully, surfaced to the UI next to the sample download.
     *
     * @return array<int, string>
     */
    public function requiredColumns(): array;

    /**
     * @return array<int, string> non-fatal warnings about the row (e.g. columns
     *         that were ignored because they don't match a known field)
     *
     * @throws RowImportException on invalid/unresolvable row data
     */
    public function importRow(array $row, ImportConfig $config): array;
}
