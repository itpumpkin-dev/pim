<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\ExportConfig;
use App\Services\ImportExport\MasterEntityDefinition;

/**
 * Generic counterpart to MasterEntityRowImporter — see
 * MasterEntityDefinition's docblock for why one exporter covers all 9
 * "simple master" entities (Brand, Base Unit, Point, Commission Group,
 * Business Type, Vendor, Currency, Product Grade, Product Type).
 */
class MasterEntityRowExporter implements RowExporterInterface
{
    public function __construct(private readonly MasterEntityDefinition $definition)
    {
    }

    public function columns(): array
    {
        return $this->definition->columns();
    }

    public function rows(ExportConfig $config): \Generator
    {
        $def = $this->definition;
        $modelClass = $def->modelClass;

        $query = $modelClass::query();
        foreach ($def->fkLookups as $fkColumn => $lookup) {
            $query->with(str_replace('_id', '', $fkColumn));
        }

        foreach ($query->orderBy('id')->cursor() as $record) {
            $row = [$def->keyColumn => (string) $record->{$def->keyColumn}];

            foreach ($def->fkLookups as $fkColumn => $lookup) {
                $lookupColumn = $lookup['lookupColumn'] ?? 'code';
                $related = $record->{str_replace('_id', '', $fkColumn)};
                $row[$lookup['inputColumn']] = $related?->{$lookupColumn} ?? '';
            }

            if ($def->nameColumn !== null) {
                $row[$def->nameColumn] = (string) ($record->{$def->nameColumn} ?? '');
            }

            foreach ($def->fillable as $column) {
                if (array_key_exists($column, $def->fkLookups)) {
                    continue;
                }

                $value = $record->{$column};
                if (in_array($column, $def->booleanColumns, true)) {
                    $row[$column] = $value ? '1' : '0';
                } else {
                    $row[$column] = (string) ($value ?? '');
                }
            }

            yield $row;
        }
    }
}
