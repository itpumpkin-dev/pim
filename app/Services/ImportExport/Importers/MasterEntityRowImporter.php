<?php

namespace App\Services\ImportExport\Importers;

use App\Models\ImportConfig;
use App\Services\ImportExport\Importers\Concerns\WritesLocalizedTranslation;
use App\Services\ImportExport\MasterEntityDefinition;
use App\Services\ImportExport\RowImportException;

/**
 * One generic importer driving any MasterEntityDefinition (Brand, Base Unit,
 * Point, Commission Group, Business Type, Vendor, Currency, Product Grade,
 * Product Type) — see that class's docblock for why these 9 are uniform
 * enough to share one implementation, modeled directly on
 * CategoryRowImporter (code/name/translations + updateOrCreate-by-key).
 */
class MasterEntityRowImporter implements RowImporterInterface
{
    use HasStaticColumnLabels;
    use WritesLocalizedTranslation;

    public function __construct(private readonly MasterEntityDefinition $definition)
    {
    }

    public function columns(): array
    {
        return $this->definition->columns();
    }

    public function requiredColumns(): array
    {
        return $this->definition->requiredColumns();
    }

    public function importRow(array $row, ImportConfig $config): array
    {
        $def = $this->definition;
        $modelClass = $def->modelClass;

        $key = trim((string) ($row[$def->keyColumn] ?? ''));
        if ($key === '') {
            throw new RowImportException("{$def->keyColumn} is required");
        }

        if ($config->action === 'delete') {
            $record = $modelClass::where($def->keyColumn, $key)->first();
            if (!$record) {
                throw new RowImportException(ucfirst(str_replace('_', ' ', class_basename($modelClass)))." with {$def->keyColumn} '{$key}' not found");
            }
            $record->delete();

            return [];
        }

        $name = $def->nameColumn !== null ? trim((string) ($row[$def->nameColumn] ?? '')) : null;
        if ($def->nameColumn !== null && $name === '') {
            throw new RowImportException("{$def->nameColumn} is required");
        }

        foreach ($def->extraRequiredColumns as $column) {
            if (trim((string) ($row[$column] ?? '')) === '') {
                throw new RowImportException("{$column} is required");
            }
        }

        foreach ($def->dateColumns as $column) {
            $value = trim((string) ($row[$column] ?? ''));
            if ($value !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
                throw new RowImportException("{$column} must be a date in YYYY-MM-DD format");
            }
        }

        $existing = $modelClass::where($def->keyColumn, $key)->first();

        $attributes = [];

        foreach ($def->fillable as $column) {
            if (array_key_exists($column, $def->fkLookups)) {
                continue;
            }

            $value = trim((string) ($row[$column] ?? ''));

            if (in_array($column, $def->booleanColumns, true)) {
                $raw = strtolower($value !== '' ? $value : '1');
                $attributes[$column] = in_array($raw, ['1', 'true', 'yes'], true);

                continue;
            }

            if ($value !== '') {
                $attributes[$column] = $value;
            } elseif ($existing) {
                // แถวเดิมมีอยู่แล้ว แต่ไฟล์ import ปล่อยคอลัมน์นี้ว่างไว้ — คงค่า
                // เดิมไว้ตรงๆ (ไม่ใช่ล้างทิ้งเป็น NULL) ให้ตรงกับพฤติกรรมของ
                // CategoryRowImporter ที่ import แบบ partial-row ไม่ล้างฟิลด์ที่
                // ไม่ได้กรอกมา
                $attributes[$column] = $existing->{$column};
            }
            // ทั้งว่างและไม่มีแถวเดิม (สร้างใหม่) — ไม่ใส่ key นี้เข้าไปใน
            // $attributes เลย ปล่อยให้ default ระดับ DB (เช่น sort_order = 0)
            // ทำงานตามปกติ แทนที่จะยัด NULL ตรงๆ ซึ่งบางคอลัมน์เป็น NOT NULL
            // จะทำให้ insert พังทันที (เช่น brands.sort_order)
        }

        foreach ($def->fkLookups as $fkColumn => $lookup) {
            $inputValue = trim((string) ($row[$lookup['inputColumn']] ?? ''));
            if ($inputValue === '') {
                if ($existing) {
                    $attributes[$fkColumn] = $existing->{$fkColumn};
                }

                continue;
            }

            $lookupColumn = $lookup['lookupColumn'] ?? 'code';
            $relatedId = $lookup['model']::where($lookupColumn, $inputValue)->value('id');
            if ($relatedId === null) {
                throw new RowImportException("Unknown {$lookup['inputColumn']} '{$inputValue}'");
            }
            $attributes[$fkColumn] = $relatedId;
        }

        // ค่า "ชื่อ" ของ entity ที่ไม่มีตาราง translation ของตัวเอง (Point ใช้
        // point_type ทั้งเป็น key และเป็นชื่อในตัว, CommissionGroup ใช้
        // p_group_name เป็น field ธรรมดา) เขียนตรงๆ ไม่ต้องผ่าน
        // resolveRawColumnValue()/writeLocalizedTranslation() เหมือน entity
        // ที่มี translation จริง
        if ($def->nameColumn !== null && $def->translationModelClass === null) {
            $attributes[$def->nameColumn] = $name;
        } elseif ($def->nameColumn !== null) {
            $attributes[$def->nameColumn] = $this->resolveRawColumnValue(
                $existing?->getRawOriginal($def->nameColumn),
                $name,
                $config->source_locale,
            );
        }

        $record = $modelClass::updateOrCreate([$def->keyColumn => $key], $attributes);

        if ($def->nameColumn !== null && $def->translationModelClass !== null && $def->translationForeignKey !== null) {
            $this->writeLocalizedTranslation(
                $def->translationModelClass,
                $def->translationForeignKey,
                $record->id,
                $name,
                $config->source_locale,
                (bool) $config->ai_translate,
            );
        }

        return [];
    }
}
