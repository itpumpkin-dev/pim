<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\IOFactory;

return new class extends Migration
{
    /**
     * "เวนเดอร์" (Vendors) master — matches the fields on the supplied
     * "สร้างเวนเดอร์" create-form screenshot: vendor details (code, name,
     * English name, short name, vendor group, tax id, branch, a 4-line tax
     * invoice address, main currency, payment terms, DefaultPriceTerm,
     * remark) plus a contact-info block (name, position, phone, fax, email,
     * a 4-line address, country).
     *
     * Seeded from storage/app/vendormaster/VendorMasterr.xlsx (349 rows) when
     * that file is present — skipped silently otherwise (e.g. a fresh
     * environment that never received the source file) so this migration
     * still runs cleanly anywhere.
     */
    public function up(): void
    {
        Schema::create('vendors', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('name_en')->nullable();
            $table->string('short_name')->nullable();
            // 'domestic' (ในประเทศ) | 'foreign' (ต่างประเทศ)
            $table->string('vendor_group')->nullable();
            $table->string('tax_id')->nullable();
            $table->string('branch')->nullable();
            $table->string('tax_invoice_address_1')->nullable();
            $table->string('tax_invoice_address_2')->nullable();
            $table->string('tax_invoice_address_3')->nullable();
            $table->string('tax_invoice_address_4')->nullable();
            $table->foreignId('currency_id')->nullable()->constrained('currencies')->nullOnDelete();
            $table->string('payment_terms')->nullable();
            // One of C&F / CIF / CNF / FOB / TNV / TVAT — plain string, not
            // an enum column, so adding a term later is a data change, not a
            // migration.
            $table->string('default_price_term')->nullable();
            $table->text('remark')->nullable();
            $table->string('contact_name')->nullable();
            $table->string('contact_position')->nullable();
            $table->string('contact_phone')->nullable();
            $table->string('contact_fax')->nullable();
            $table->string('contact_email')->nullable();
            $table->string('contact_address_1')->nullable();
            $table->string('contact_address_2')->nullable();
            $table->string('contact_address_3')->nullable();
            $table->string('contact_address_4')->nullable();
            $table->string('contact_country')->nullable();
            // Not on the create form yet — carried over from the source
            // data's CreditTerm column for later use.
            $table->integer('credit_term_days')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $this->seedFromSpreadsheet();
    }

    private function seedFromSpreadsheet(): void
    {
        // Not Storage::disk('local') — this app's 'local' disk root is
        // storage/app/private (Laravel 11+ default), but the source file
        // lives directly under storage/app/vendormaster/.
        $path = storage_path('app/vendormaster/VendorMasterr.xlsx');
        if (! file_exists($path)) {
            return;
        }

        $currencyIdByCode = DB::table('currencies')->pluck('id', 'code');
        // The source file's currency codes don't all match ISO codes in our
        // `currencies` table (RMB → Renminbi/Chinese Yuan, YEN → Japanese
        // Yen's ISO code).
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

        // Chunk the insert — 349 rows of ~25 columns each is comfortably
        // under any driver's parameter/packet limit in one go, but chunking
        // keeps this safe if the source file grows a lot before this
        // migration is next touched.
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
        Schema::dropIfExists('vendors');
    }
};
