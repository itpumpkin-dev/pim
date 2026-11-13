<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\ExportConfig;
use App\Models\Locale;
use App\Models\Vendor;
use App\Services\ImportExport\Importers\VendorRowImporter;

/**
 * ส่งออกเวนเดอร์เป็นคอลัมน์ชุดเดียวกับ ERP Vendor Master (VendorRowImporter::COLUMNS) —
 * ไฟล์ที่ได้นำเข้ากลับผ่าน VendorRowImporter ได้ทันที
 */
class VendorRowExporter implements RowExporterInterface
{
    public function columns(): array
    {
        return VendorRowImporter::COLUMNS;
    }

    public function rows(ExportConfig $config): \Generator
    {
        $thaiId = Locale::idForCode('th');
        $englishId = Locale::idForCode('en');
        $groupName = ['domestic' => 'ในประเทศ', 'foreign' => 'ต่างประเทศ'];
        $groupType = ['domestic' => 'LocalVend', 'foreign' => 'ImportVend'];
        $str = fn ($value): string => $value === null ? '' : (string) $value;

        // lazy() ไม่ใช่ cursor() — cursor() ข้าม eager load ทำให้ currency/translations query ทีละแถว
        foreach (Vendor::with('currency')->orderBy('code')->lazy(500) as $vendor) {
            $label = fn (?int $localeId) => $vendor->translations->firstWhere('locale_id', $localeId)?->label;
            $vendorType = $vendor->vendor_type ?: ($groupType[$vendor->vendor_group] ?? '');

            $row = [];
            foreach (VendorRowImporter::DIRECT as $column => $field) {
                $row[$column] = $str($vendor->getRawOriginal($field));
            }

            yield array_merge(array_fill_keys(VendorRowImporter::COLUMNS, ''), $row, [
                'VendId' => $vendor->code,
                'VendName' => $label($thaiId) ?: $vendor->name,
                'VendStatus' => $vendor->is_active ? 'Active' : 'Inactive',
                'VendType' => $vendorType,
                'VendEName' => $str($label($englishId)),
                'VendLat' => $str($vendor->latitude),
                'VendLong' => $str($vendor->longitude),
                'InvCountry' => $str($vendor->invoice_country ?: $vendor->contact_country),
                'CreditTerm' => $str($vendor->credit_term_days),
                'CreditLimit' => $str($vendor->credit_limit),
                'CurrId' => $str($vendor->currency?->code),
                'BusinessTypeId' => $vendor->business_type_code ?: $vendorType,
                'BusinessTypeName' => $groupName[$vendor->vendor_group] ?? '',
                'RevisionNo' => $str($vendor->erp_revision_no),
            ]);
        }
    }
}
