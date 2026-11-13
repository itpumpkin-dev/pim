<?php

namespace App\Services\ImportExport\Importers;

use App\Models\Currency;
use App\Models\ImportConfig;
use App\Models\Vendor;
use App\Models\VendorTranslation;
use App\Services\ImportExport\Importers\Concerns\WritesLocalizedTranslation;
use App\Services\ImportExport\RowImportException;

/**
 * นำเข้าเวนเดอร์จากไฟล์ export ของ ERP (Vendor Master) ได้ตรงๆ — คอลัมน์ของ template คือหัวคอลัมน์
 * ของ ERP เป๊ะ (VendId … VendShortName, ดู COLUMNS) ไม่ต้องแปลงไฟล์ก่อน และนำเข้าได้ครบทุกคอลัมน์
 * (ฟิลด์ที่ PIM เดิมไม่มีที่เก็บ เพิ่มไว้ใน migration add_erp_fields_to_vendors_table)
 *
 * แทน MasterEntityRowImporter ตัว generic เดิมของ vendors (คอลัมน์ code/name/currency_code/...)
 * เพราะ ERP ต้องแปลงค่าหลายคอลัมน์ (VendStatus → is_active, BusinessTypeName → vendor_group,
 * VendEName → คำแปลภาษาอังกฤษ, ที่อยู่แยกช่อง → 4 บรรทัดของฟอร์ม) — VendorRowExporter ส่งออก
 * คอลัมน์ชุดเดียวกันนี้ ไฟล์ export เลยนำเข้ากลับได้ทันที
 *
 * เหมือน importer ตัวอื่น: ช่องว่างในไฟล์ = คงค่าเดิมไว้ (ไม่ล้าง) สำหรับเวนเดอร์ที่มีอยู่แล้ว
 */
class VendorRowImporter implements RowImporterInterface
{
    use WritesLocalizedTranslation;

    /**
     * หัวคอลัมน์ของ ERP ตามลำดับในไฟล์ export — ยกเว้น CreateOn/CreateBy(Name)/UpdateOn/UpdateBy(Name)
     * ที่ไม่เก็บ (ใช้ created_at/updated_at ของ PIM เอง) ไฟล์ ERP ที่ยังมีคอลัมน์พวกนั้นอยู่ก็นำเข้าได้ แค่ถูกข้ามไป
     */
    public const COLUMNS = [
        'VendId', 'VendName', 'VendStatus', 'VendType', 'VendEName', 'VendRemark', 'VendImage', 'VendLat', 'VendLong',
        'InvAddrId', 'InvName', 'InvAddr1', 'InvAddr2', 'InvSubDistrict', 'InvDistrict', 'InvProvince', 'InvZipcode', 'InvCountry',
        'TaxCode', 'BranchCode', 'PaymentId', 'PaymentName', 'CreditTerm', 'CreditLimit', 'PaymentRemark',
        'VendLineDiscRate', 'VendDocDiscRate', 'CurrId',
        'ContactId', 'ContactPerson', 'ContactPosition', 'ContactPhone', 'ContactFax', 'ContactEmail', 'ShipRemark',
        'BusinessTypeId', 'BusinessTypeName', 'RevisionNo', 'VendShortName',
    ];

    /** คอลัมน์ ERP ที่เก็บลงคอลัมน์ของ vendors ตรงๆ (ค่าข้อความ ไม่ต้องแปลง) */
    public const DIRECT = [
        'VendType' => 'vendor_type',
        'VendRemark' => 'remark',
        'VendImage' => 'image',
        'InvAddrId' => 'invoice_address_code',
        'InvName' => 'invoice_name',
        'InvAddr1' => 'tax_invoice_address_1',
        'InvAddr2' => 'tax_invoice_address_2',
        'InvSubDistrict' => 'invoice_sub_district',
        'InvDistrict' => 'invoice_district',
        'InvProvince' => 'invoice_province',
        'InvZipcode' => 'invoice_zipcode',
        'InvCountry' => 'invoice_country',
        'TaxCode' => 'tax_id',
        'BranchCode' => 'branch',
        'PaymentId' => 'payment_code',
        'PaymentName' => 'default_price_term',
        'PaymentRemark' => 'payment_terms',
        'VendLineDiscRate' => 'line_discount_rate',
        'VendDocDiscRate' => 'doc_discount_rate',
        'ContactId' => 'contact_code',
        'ContactPerson' => 'contact_name',
        'ContactPosition' => 'contact_position',
        'ContactPhone' => 'contact_phone',
        'ContactFax' => 'contact_fax',
        'ContactEmail' => 'contact_email',
        'ShipRemark' => 'ship_remark',
        'BusinessTypeId' => 'business_type_code',
        'VendShortName' => 'short_name',
    ];

    /** BusinessTypeName / VendType → vendors.vendor_group */
    public const VENDOR_GROUP = [
        'ในประเทศ' => 'domestic', 'localvend' => 'domestic',
        'ต่างประเทศ' => 'foreign', 'importvend' => 'foreign',
    ];

    /** รหัสสกุลเงินของ ERP ที่ไม่ตรงกับ ISO ในตาราง currencies (เหมือน seed เดิมของ vendors) */
    private const CURRENCY_ALIASES = ['RMB' => 'CNY', 'YEN' => 'JPY'];

    public function columns(): array
    {
        return self::COLUMNS;
    }

    /** หัวคอลัมน์ ERP ใช้เป็น label ตรงๆ — ไม่แปลชื่อ ไฟล์จาก ERP จะได้ตรงกับ template ทุกภาษา */
    public function columnLabels(): array
    {
        return array_combine(self::COLUMNS, self::COLUMNS);
    }

    public function requiredColumns(): array
    {
        return ['VendId', 'VendName'];
    }

    public function importRow(array $row, ImportConfig $config): array
    {
        $cell = fn (string $column): string => trim((string) ($row[$column] ?? ''));
        $warnings = [];

        $code = $cell('VendId');
        if ($code === '') {
            throw new RowImportException('VendId is required');
        }

        if ($config->action === 'delete') {
            $vendor = Vendor::where('code', $code)->first();
            if (! $vendor) {
                throw new RowImportException("Vendor with VendId '{$code}' not found");
            }
            $vendor->delete();

            return [];
        }

        $name = $cell('VendName');
        if ($name === '') {
            throw new RowImportException('VendName is required');
        }

        $values = [];

        foreach (self::DIRECT as $column => $field) {
            $values[$field] = $cell($column);
        }

        // ที่อยู่ 4 บรรทัดที่ฟอร์มแสดง: บรรทัด 1-2 = InvAddr1/2 (ใน DIRECT แล้ว), 3 = ตำบล + อำเภอ, 4 = จังหวัด + รหัสไปรษณีย์
        $values['tax_invoice_address_3'] = trim($cell('InvSubDistrict').' '.$cell('InvDistrict'));
        $values['tax_invoice_address_4'] = trim($cell('InvProvince').' '.$cell('InvZipcode'));
        $values['contact_country'] = $cell('InvCountry');

        $groupKey = mb_strtolower($cell('BusinessTypeName') ?: $cell('VendType'));
        $values['vendor_group'] = self::VENDOR_GROUP[$groupKey] ?? '';
        if ($groupKey !== '' && $values['vendor_group'] === '') {
            $warnings[] = "Unknown BusinessTypeName/VendType '{$groupKey}' — vendor_group left unchanged";
        }

        if ($values['default_price_term'] !== '' && ! in_array($values['default_price_term'], Vendor::PRICE_TERMS, true)) {
            $warnings[] = "PaymentName '{$values['default_price_term']}' is not one of ".implode('/', Vendor::PRICE_TERMS);
        }

        // VendLat/VendLong = 0 ใน ERP แปลว่าไม่ได้กรอก
        foreach (['VendLat' => 'latitude', 'VendLong' => 'longitude'] as $column => $field) {
            $values[$field] = is_numeric($cell($column)) && (float) $cell($column) != 0.0 ? $cell($column) : '';
        }
        foreach (['CreditTerm' => 'credit_term_days', 'RevisionNo' => 'erp_revision_no'] as $column => $field) {
            $values[$field] = $this->number($cell($column), $column, $warnings, integer: true);
        }
        $values['credit_limit'] = $this->number($cell('CreditLimit'), 'CreditLimit', $warnings);

        $status = $cell('VendStatus');
        if ($status !== '') {
            $values['is_active'] = mb_strtolower($status) === 'active';
        }

        $currencyCode = strtoupper($cell('CurrId'));
        if ($currencyCode !== '') {
            $currencyCode = self::CURRENCY_ALIASES[$currencyCode] ?? $currencyCode;
            $currencyId = Currency::whereRaw('upper(code) = ?', [$currencyCode])->value('id');
            if ($currencyId === null) {
                throw new RowImportException("Unknown CurrId '{$cell('CurrId')}'");
            }
            $values['currency_id'] = $currencyId;
        }

        // ช่องว่าง = ไม่ส่ง field นั้นเลย → updateOrCreate คงค่าเดิมไว้ (แถวใหม่ก็ใช้ default ของ DB)
        $attributes = array_filter($values, fn ($value) => $value !== '' && $value !== null);
        $attributes['name'] = $name;

        $vendor = Vendor::updateOrCreate(['code' => $code], $attributes);

        // VendName = ชื่อไทย (ภาษาของคอลัมน์ name ตาม convention), VendEName = ชื่ออังกฤษ —
        // เขียนอังกฤษก่อน AI translate (ถ้าเปิด) จะได้ไม่ไปแปลทับชื่ออังกฤษจริงจาก ERP
        $englishName = $cell('VendEName');
        if ($englishName !== '') {
            $this->writeLocalizedTranslation(VendorTranslation::class, 'vendor_id', $vendor->id, $englishName, 'en', false);
        }
        $this->writeLocalizedTranslation(VendorTranslation::class, 'vendor_id', $vendor->id, $name, self::RAW_COLUMN_LOCALE, (bool) $config->ai_translate);

        return $warnings;
    }

    private function number(string $value, string $column, array &$warnings, bool $integer = false): string
    {
        if ($value === '') {
            return '';
        }
        $clean = str_replace(',', '', $value);
        if (! is_numeric($clean)) {
            $warnings[] = "{$column} '{$value}' is not a number — skipped";

            return '';
        }

        return $integer ? (string) (int) $clean : $clean;
    }

}
