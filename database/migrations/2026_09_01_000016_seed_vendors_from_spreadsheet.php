<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\IOFactory;

return new class extends Migration
{
    /**
     * create_vendors_table's seed step used Storage::disk('local')->path(),
     * but this app's 'local' disk root is storage/app/private (Laravel 11+
     * default) while the source file lives directly under
     * storage/app/vendormaster/ — so file_exists() was always false and the
     * import silently inserted nothing. Fixed in create_vendors_table for
     * fresh installs; this repeats the (now correctly-pathed) import for any
     * environment — this one included — that already ran the no-op version.
     * Guarded on an empty table so it's a no-op if vendors already exist.
     */
    public function up(): void
    {
        if (DB::table('vendors')->count() > 0) {
            return;
        }

        $path = storage_path('app/vendormaster/VendorMasterr.xlsx');
        if (! file_exists($path)) {
            return;
        }

        $currencyIdByCode = DB::table('currencies')->pluck('id', 'code');
        $currencyAliases = ['RMB' => 'CNY', 'YEN' => 'JPY'];
        $vendorGroupMap = ['ในประเทศ' => 'domestic', 'ต่างประเทศ' => 'foreign'];

        $sheet = IOFactory::load($path)->getActiveSheet();
        $now = now();
        $rows = [];

        foreach ($sheet->getRowIterator(2) as $row) {
            $cells = [];
            foreach ($row->getCellIterator('A', 'AG') as $cell) {
                $cells[] = $cell->getValue();
            }

            $code = trim((string) ($cells[0] ?? ''));
            $name = trim((string) ($cells[1] ?? ''));
            if ($code === '' || $name === '') {
                continue;
            }

            $currencyCode = trim((string) ($cells[24] ?? ''));
            $currencyCode = $currencyAliases[$currencyCode] ?? $currencyCode;

            $vendType = trim((string) ($cells[32] ?? ''));

            $rows[] = [
                'code' => $code,
                'name' => $name,
                'name_en' => $this->nullableTrim($cells[2] ?? null),
                'short_name' => $this->nullableTrim($cells[3] ?? null),
                'vendor_group' => $vendorGroupMap[$vendType] ?? null,
                'tax_id' => $this->nullableTrim($cells[10] ?? null),
                'branch' => $this->nullableTrim($cells[11] ?? null),
                'tax_invoice_address_1' => $this->nullableTrim($cells[6] ?? null),
                'tax_invoice_address_2' => $this->nullableTrim($cells[7] ?? null),
                'tax_invoice_address_3' => $this->nullableTrim($cells[8] ?? null),
                'tax_invoice_address_4' => $this->nullableTrim($cells[9] ?? null),
                'currency_id' => $currencyCode !== '' ? ($currencyIdByCode[$currencyCode] ?? null) : null,
                'payment_terms' => $this->nullableTrim($cells[25] ?? null),
                'default_price_term' => $this->nullableTrim($cells[23] ?? null),
                'remark' => $this->nullableTrim($cells[5] ?? null),
                'contact_name' => $this->nullableTrim($cells[16] ?? null),
                'contact_position' => $this->nullableTrim($cells[17] ?? null),
                'contact_phone' => $this->nullableTrim($cells[12] ?? null),
                'contact_fax' => $this->nullableTrim($cells[13] ?? null),
                'contact_email' => $this->nullableTrim($cells[14] ?? null),
                'contact_address_1' => $this->nullableTrim($cells[18] ?? null),
                'contact_address_2' => $this->nullableTrim($cells[19] ?? null),
                'contact_address_3' => $this->nullableTrim($cells[20] ?? null),
                'contact_address_4' => $this->nullableTrim($cells[21] ?? null),
                'contact_country' => $this->nullableTrim($cells[22] ?? null),
                'credit_term_days' => is_numeric($cells[15] ?? null) ? (int) $cells[15] : null,
                'is_active' => strtolower(trim((string) ($cells[4] ?? ''))) === 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        foreach (array_chunk($rows, 100) as $chunk) {
            DB::table('vendors')->insert($chunk);
        }
    }

    private function nullableTrim(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim((string) $value);

        return $trimmed === '' ? null : $trimmed;
    }

    public function down(): void
    {
        // Data import — no reasonable rollback (would also delete anything
        // added by hand since).
    }
};
