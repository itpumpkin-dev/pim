<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Currency;
use App\Models\Locale;
use App\Models\Vendor;
use App\Models\VendorTranslation;
use App\Support\TranslationTracking;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "เวนเดอร์" (Vendors) master — CRUD over the `vendors` table. Field set and
 * layout mirror the supplied "สร้างเวนเดอร์" screenshot: vendor details +
 * a contact-info block. Same list / create-page / edit-page shape as the
 * other catalog master screens; `edit_vendors` covers every write. Every
 * write also mirrors into the `vendor` attribute's options (see
 * SyncsAttributeOptionMirror), so it drives that dropdown in Edit Product.
 *
 * `name` มีคำแปลหลายภาษาจริงแล้ว (ดู VendorTranslation / migration
 * create_vendor_translations_table) — ยุบเข้ามาแทนที่คอลัมน์ `name_en` เดิม
 * (ดู migration drop_vendor_name_en_column) ฟอร์มรับ `translations` (array
 * locale_id => label) แบบเดียวกับ BaseUnitController/BrandController แทนที่
 * จะเป็นช่อง name/name_en แยกกันสองช่องเหมือนเดิม คอลัมน์ `name` ยังคงเก็บชื่อ
 * ของ locale เริ่มต้นของแอปไว้เป็น fallback (ที่อื่นในระบบยังอ้างอิงคอลัมน์นี้
 * ตรงๆ อยู่)
 */
class VendorController extends Controller
{
    use SyncsAttributeOptionMirror;

    private const MIRROR_ATTRIBUTE = 'vendor';
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $sortable = ['code', 'name', 'vendor_group', 'is_active'];
        $sort = in_array($request->input('sort'), $sortable, true) ? $request->input('sort') : 'name';
        $dir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $vendors = Vendor::query()
            ->with('currency:id,code')
            ->when($search !== '', function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('short_name', 'like', "%{$search}%")
                    ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
            })
            ->orderBy($sort, $dir)
            ->paginate($perPage)
            ->withQueryString();

        // name_en ไม่ใช่คอลัมน์จริงอีกต่อไป (ยุบเข้า translations แล้ว) — คำนวณ
        // ค่าเดิมกลับมาจากคำแปลของ locale อังกฤษแทน เพื่อให้ vendors/index.tsx
        // (ที่โชว์ชื่ออังกฤษเป็นข้อความรองใต้ชื่อหลัก) ไม่ต้องแก้อะไรเลย — คงไว้
        // เป็น 'en' ตายตัวเสมอ ไม่ผูกกับ locale ปัจจุบัน (เป็นข้อความรองสำหรับ
        // อ้างอิงข้าม locale ไม่ใช่ตัวเดียวกับ $localeId ด้านล่าง)
        $enLocaleId = Locale::idForCode('en');
        // `name` ดิบเป็นแค่ fallback ของ locale เริ่มต้นของแอป — หน้า list เดิม
        // ส่งค่านี้ตรงๆ ไม่เคย resolve ตาม locale ปัจจุบันเลย ทับด้วยคำแปลของ
        // locale ปัจจุบันตรงนี้ก่อนส่งออกไป ถ้ามี (ไม่งั้นคงค่าดิบไว้เป็น fallback)
        $localeId = Locale::idForCode(app()->getLocale());
        $vendors->getCollection()->transform(function (Vendor $vendor) use ($enLocaleId, $localeId) {
            $vendor->currency_code = $vendor->currency?->code;
            $vendor->name_en = $enLocaleId ? ($vendor->translations->firstWhere('locale_id', $enLocaleId)?->label ?? null) : null;

            $label = $localeId ? $vendor->translations->firstWhere('locale_id', $localeId)?->label : null;
            if ($label !== null && trim($label) !== '') {
                $vendor->name = $label;
            }

            return $vendor;
        });

        return Inertia::render('catalog/vendors/index', [
            'vendors' => $vendors,
            'filters' => [
                'search' => $search,
                'sort' => $sort,
                'dir' => $dir,
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/vendors/create', [
            'currencies' => $this->currencyOptions(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validatePayload($request);
        $translations = $validated['translations'];
        unset($validated['translations']);

        $vendor = Vendor::create(['name' => $this->resolveName($translations)] + $validated);

        $this->syncTranslations($vendor, $translations);
        $this->autoTranslate($vendor, $translations);

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, $vendor->code, $vendor->name, $vendor->is_active);

        return to_route('catalog.vendors.index')->with('success', 'Vendor added successfully.');
    }

    public function edit(Vendor $vendor): Response
    {
        $translations = $vendor->translations
            ->mapWithKeys(fn (VendorTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();

        return Inertia::render('catalog/vendors/edit', [
            'vendor' => $vendor->only([
                'id', 'code', 'name', 'short_name', 'vendor_group', 'tax_id', 'branch',
                'tax_invoice_address_1', 'tax_invoice_address_2', 'tax_invoice_address_3', 'tax_invoice_address_4',
                'currency_id', 'payment_terms', 'default_price_term', 'remark',
                'contact_name', 'contact_position', 'contact_phone', 'contact_fax', 'contact_email',
                'contact_address_1', 'contact_address_2', 'contact_address_3', 'contact_address_4', 'contact_country',
                'is_active',
            ]),
            'translations' => $translations,
            'currencies' => $this->currencyOptions(),
        ]);
    }

    public function update(Request $request, Vendor $vendor): RedirectResponse
    {
        $oldCode = $vendor->code;

        $validated = $this->validatePayload($request, $vendor);
        $translations = $validated['translations'];
        unset($validated['translations']);

        $vendor->update(['name' => $this->resolveName($translations) ?? $vendor->name] + $validated);

        $this->syncTranslations($vendor, $translations);
        $this->autoTranslate($vendor, $translations);

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $oldCode, $vendor->code, $vendor->name, $vendor->is_active);

        return to_route('catalog.vendors.index')->with('success', 'Vendor updated successfully.');
    }

    public function destroy(Vendor $vendor): RedirectResponse
    {
        $vendor->delete();

        $this->removeAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $vendor->code);

        return to_route('catalog.vendors.index')->with('success', 'Vendor deleted successfully.');
    }

    private function currencyOptions()
    {
        return Currency::orderBy('code')->get(['id', 'code', 'name']);
    }

    /**
     * ตรวจ translations ก่อน (ต้องมีอย่างน้อยหนึ่งภาษาไม่ว่างเปล่า) แล้วค่อย
     * resolve เป็น `name` เดี่ยวๆ ทีหลังตอนสร้าง/บันทึกจริง (ดู store()/update())
     * — ต้องทำแบบนี้เพราะฟอร์มไม่ได้ส่ง `name`/`name_en` แยกกันสองช่องมาตรงๆ
     * อีกต่อไป (ส่งเป็น translations array แทน)
     *
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Vendor $vendor = null): array
    {
        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:50',
                Rule::unique('vendors', 'code')->ignore($vendor?->id),
            ],
            'translations' => ['required', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'short_name' => ['nullable', 'string', 'max:255'],
            'vendor_group' => ['nullable', Rule::in(Vendor::VENDOR_GROUPS)],
            'tax_id' => ['nullable', 'string', 'max:50'],
            'branch' => ['nullable', 'string', 'max:255'],
            'tax_invoice_address_1' => ['nullable', 'string', 'max:255'],
            'tax_invoice_address_2' => ['nullable', 'string', 'max:255'],
            'tax_invoice_address_3' => ['nullable', 'string', 'max:255'],
            'tax_invoice_address_4' => ['nullable', 'string', 'max:255'],
            'currency_id' => ['nullable', 'integer', Rule::exists('currencies', 'id')],
            'payment_terms' => ['nullable', 'string', 'max:255'],
            'default_price_term' => ['nullable', Rule::in(Vendor::PRICE_TERMS)],
            'remark' => ['nullable', 'string', 'max:2000'],
            'contact_name' => ['nullable', 'string', 'max:255'],
            'contact_position' => ['nullable', 'string', 'max:255'],
            'contact_phone' => ['nullable', 'string', 'max:50'],
            'contact_fax' => ['nullable', 'string', 'max:50'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            'contact_address_1' => ['nullable', 'string', 'max:255'],
            'contact_address_2' => ['nullable', 'string', 'max:255'],
            'contact_address_3' => ['nullable', 'string', 'max:255'],
            'contact_address_4' => ['nullable', 'string', 'max:255'],
            'contact_country' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
        ]);

        Validator::make(
            ['translations' => $this->resolveName($validated['translations'])],
            ['translations' => ['required', 'string', 'max:255']],
        )->validate();

        $validated['is_active'] = $request->boolean('is_active', true);

        return $validated;
    }

    /**
     * คัดลอกมาจาก BaseUnitController::resolveName() — ทำให้คอลัมน์ `name`
     * ตรงกับคำแปลของ locale เริ่มต้นของแอปเสมอ
     */
    private function resolveName(array $translations): ?string
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));

        if ($defaultLocaleId !== null && ! empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');

        return $firstNonEmpty !== null ? trim($firstNonEmpty) : null;
    }

    /**
     * คัดลอกมาจาก BaseUnitController::autoTranslate() — ยึดตามแฟล็ก
     * "AI translate" ของ attribute แม่ (vendor) เหมือนกับ master อื่นๆ ที่มี
     * คำแปลหลายภาษา
     */
    private function autoTranslate(Vendor $vendor, array $translations): void
    {
        $attribute = Attribute::where('code', self::MIRROR_ATTRIBUTE)->first();
        if (! $attribute || ! $attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        TranslationTracking::dispatchLabels(
            VendorTranslation::class,
            'vendor_id',
            $vendor->id,
            $sourceLocaleId,
            $sourceLabel,
            'vendors',
            $vendor->code,
            auth()->id(),
        );
    }

    /**
     * คัดลอกมาจาก BaseUnitController::resolveAutoTranslateSource()
     *
     * @param  array<int|string, mixed>  $translations
     * @return array{0: int|null, 1: string}
     */
    private function resolveAutoTranslateSource(array $translations): array
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));
        $defaultLabel = trim((string) ($translations[$defaultLocaleId] ?? ''));

        if ($defaultLocaleId !== null && $defaultLabel !== '') {
            return [$defaultLocaleId, $defaultLabel];
        }

        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';
            if ($label !== '') {
                return [(int) $localeId, $label];
            }
        }

        return [null, ''];
    }

    /**
     * คัดลอกมาจาก BaseUnitController::syncTranslations()
     */
    private function syncTranslations(Vendor $vendor, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                VendorTranslation::where('vendor_id', $vendor->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            VendorTranslation::updateOrCreate(
                ['vendor_id' => $vendor->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
