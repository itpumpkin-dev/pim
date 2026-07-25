<?php

namespace App\Services\ImportExport;

use App\Services\ImportExport\Exporters\AttributeFamilyRowExporter;
use App\Services\ImportExport\Exporters\AttributeRowExporter;
use App\Services\ImportExport\Exporters\CategoryRowExporter;
use App\Services\ImportExport\Exporters\ProductRowExporter;
use App\Services\ImportExport\Exporters\RowExporterInterface;
use App\Services\ImportExport\Importers\AttributeFamilyRowImporter;
use App\Services\ImportExport\Importers\AttributeRowImporter;
use App\Services\ImportExport\Importers\CategoryRowImporter;
use App\Services\ImportExport\Importers\ProductRowImporter;
use App\Services\ImportExport\Importers\RowImporterInterface;

class ImportExportRegistry
{
    public const TYPES = ['products', 'categories', 'attributes', 'attribute_families'];

    public static function importer(string $type): RowImporterInterface
    {
        return match ($type) {
            'products' => new ProductRowImporter(),
            'categories' => new CategoryRowImporter(),
            'attributes' => new AttributeRowImporter(),
            'attribute_families' => new AttributeFamilyRowImporter(),
            default => throw new \InvalidArgumentException("Unknown import/export type: {$type}"),
        };
    }

    public static function exporter(string $type): RowExporterInterface
    {
        return match ($type) {
            'products' => new ProductRowExporter(),
            'categories' => new CategoryRowExporter(),
            'attributes' => new AttributeRowExporter(),
            'attribute_families' => new AttributeFamilyRowExporter(),
            default => throw new \InvalidArgumentException("Unknown import/export type: {$type}"),
        };
    }
}
