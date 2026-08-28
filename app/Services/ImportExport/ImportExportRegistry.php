<?php

namespace App\Services\ImportExport;

use App\Services\ImportExport\Exporters\AttributeFamilyRowExporter;
use App\Services\ImportExport\Exporters\AttributeOptionRowExporter;
use App\Services\ImportExport\Exporters\AttributeRowExporter;
use App\Services\ImportExport\Exporters\CategoryRowExporter;
use App\Services\ImportExport\Exporters\ProductRowExporter;
use App\Services\ImportExport\Exporters\RowExporterInterface;
use App\Services\ImportExport\Importers\AttributeFamilyRowImporter;
use App\Services\ImportExport\Importers\AttributeOptionRowImporter;
use App\Services\ImportExport\Importers\AttributeRowImporter;
use App\Services\ImportExport\Importers\CategoryRowImporter;
use App\Services\ImportExport\Importers\ProductRowImporter;
use App\Services\ImportExport\Importers\RowImporterInterface;
use App\Models\User;

class ImportExportRegistry
{
    public const TYPES = ['products', 'categories', 'attributes', 'attribute_families', 'attribute_options'];

    /**
     * $user is only meaningful for 'products' — the other entity types
     * aren't gated by Attribute Access, so it's silently ignored for them.
     * $jobTrackerId is likewise only meaningful for 'products': it's how
     * ProductRowImporter reports AI-translate dispatch progress back onto
     * the import's own JobTracker row (see its total_translations_* columns).
     * $familyCode is products-only too: the import wizard's chosen Attribute
     * Family, which narrows columns()/requiredColumns() to that family and is
     * filed onto every row that doesn't carry its own `family_code`.
     */
    public static function importer(string $type, ?User $user = null, ?int $jobTrackerId = null, ?string $familyCode = null): RowImporterInterface
    {
        return match ($type) {
            'products' => new ProductRowImporter($user, $jobTrackerId, $familyCode),
            'categories' => new CategoryRowImporter(),
            'attributes' => new AttributeRowImporter(),
            'attribute_families' => new AttributeFamilyRowImporter(),
            'attribute_options' => new AttributeOptionRowImporter(),
            default => throw new \InvalidArgumentException("Unknown import/export type: {$type}"),
        };
    }

    /**
     * $user is only meaningful for 'products' — see importer().
     */
    public static function exporter(string $type, ?User $user = null): RowExporterInterface
    {
        return match ($type) {
            'products' => new ProductRowExporter($user),
            'categories' => new CategoryRowExporter(),
            'attributes' => new AttributeRowExporter(),
            'attribute_families' => new AttributeFamilyRowExporter(),
            'attribute_options' => new AttributeOptionRowExporter(),
            default => throw new \InvalidArgumentException("Unknown import/export type: {$type}"),
        };
    }
}
