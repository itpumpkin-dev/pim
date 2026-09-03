<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Currency;
use App\Models\CurrencyTranslation;
use App\Models\Locale;
use App\Support\TranslationTracking;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "สกุลเงิน" (Currencies) master — CRUD over the existing `currencies` table
 * (already used by Channels' currency picker and the Vendor's main-currency
 * field). Same list / create-page / edit-page shape as the other catalog
 * master screens; `edit_currencies` covers every write. Create/update/delete
 * events are logged automatically — Currency already uses the Auditable
 * trait. Every write also mirrors into the `purchase_currency` attribute's
 * options (see SyncsAttributeOptionMirror) using the *lowercased* currency
 * code — that attribute's pre-existing options (jpy/rmb/thb/usd) already use
 * lowercase codes, so this adopts the 3 that overlap (jpy/thb/usd) instead of
 * duplicating them. `rmb` has no equivalent row in `currencies` (which uses
 * the ISO code `cny`) and is left alone — a `cny` option is added alongside
 * it rather than merged, since nothing here can tell whether existing
 * products tagged `rmb` should move to it.
 *
 * `name` มีคำแปลหลายภาษาจริงแล้ว (ดู CurrencyTranslation / migration
 * create_currency_translations_table) — ฟอร์มรับ `translations` (array
 * locale_id => label) แบบเดียวกับ BaseUnitController/BrandController แทนที่
 * จะเป็นช่อง `name` เดี่ยวๆ เหมือนเดิม คอลัมน์ `name` ยังคงเก็บชื่อของ locale
 * เริ่มต้นของแอปไว้เป็น fallback (ที่อื่นในระบบยังอ้างอิงคอลัมน์นี้ตรงๆ อยู่)
 */
class CurrencyController extends Controller
{
    use SyncsAttributeOptionMirror;

    private const MIRROR_ATTRIBUTE = 'purchase_currency';
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $sortable = ['code', 'name', 'exchange_rate'];
        $sort = in_array($request->input('sort'), $sortable, true) ? $request->input('sort') : 'code';
        $dir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $currencies = Currency::query()
            ->withCount(['channels', 'vendors'])
            ->when($search !== '', function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%");
            })
            ->orderBy($sort, $dir)
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('catalog/currencies/index', [
            'currencies' => $currencies,
            'filters' => [
                'search' => $search,
                'sort' => $sort,
                'dir' => $dir,
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/currencies/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validatePayload($request);
        $translations = $validated['translations'];

        $currency = Currency::create([
            'code' => $validated['code'],
            'name' => $validated['name'],
            'exchange_rate' => $validated['exchange_rate'],
        ]);

        $this->syncTranslations($currency, $translations);
        $this->autoTranslate($currency, $translations);

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, strtolower($currency->code), $currency->name);

        return to_route('catalog.currencies.index')->with('success', 'Currency added successfully.');
    }

    public function edit(Currency $currency): Response
    {
        $translations = $currency->translations
            ->mapWithKeys(fn (CurrencyTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();

        return Inertia::render('catalog/currencies/edit', [
            'currency' => $currency->only(['id', 'code', 'name', 'exchange_rate']),
            'translations' => $translations,
        ]);
    }

    public function update(Request $request, Currency $currency): RedirectResponse
    {
        $oldCode = strtolower($currency->code);
        $validated = $this->validatePayload($request, $currency);
        $translations = $validated['translations'];

        $currency->update([
            'code' => $validated['code'],
            'name' => $validated['name'],
            'exchange_rate' => $validated['exchange_rate'],
        ]);

        $this->syncTranslations($currency, $translations);
        $this->autoTranslate($currency, $translations);

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $oldCode, strtolower($currency->code), $currency->name);

        return to_route('catalog.currencies.index')->with('success', 'Currency updated successfully.');
    }

    public function destroy(Currency $currency): RedirectResponse
    {
        $code = strtolower($currency->code);

        $currency->delete();

        $this->removeAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $code);

        return to_route('catalog.currencies.index')->with('success', 'Currency deleted successfully.');
    }

    /**
     * ตรวจ translations ก่อน (ต้องมีอย่างน้อยหนึ่งภาษาไม่ว่างเปล่า) แล้วค่อย
     * resolve เป็น `name` เดี่ยวๆ (ของ locale เริ่มต้นของแอป) — ต่างจาก master
     * อื่นตรงที่ `code` (ISO 4217, เช่น USD) ยังพิมพ์เองตรงๆ ไม่ได้ auto-generate
     * และไม่มี description/is_active
     *
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Currency $currency = null): array
    {
        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:10',
                Rule::unique('currencies', 'code')->ignore($currency?->id),
            ],
            'translations' => ['required', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            // เทียบกับ THB — เช่น USD = 36.5000 หมายถึง 1 USD แลกได้ 36.50 บาท
            // (ดู docblock ของ migration add_exchange_rate_to_currencies_table)
            'exchange_rate' => ['required', 'numeric', 'gt:0', 'max:99999999.9999'],
        ]);

        $translations = $validated['translations'];
        $name = $this->resolveName($translations);

        Validator::make(['translations' => $name], ['translations' => ['required', 'string', 'max:255']])->validate();

        return [
            'code' => $validated['code'],
            'name' => $name,
            'translations' => $translations,
            'exchange_rate' => $validated['exchange_rate'],
        ];
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
     * "AI translate" ของ attribute แม่ (purchase_currency) เหมือนกับ master
     * อื่นๆ ที่มีคำแปลหลายภาษา
     */
    private function autoTranslate(Currency $currency, array $translations): void
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
            CurrencyTranslation::class,
            'currency_id',
            $currency->id,
            $sourceLocaleId,
            $sourceLabel,
            'currencies',
            $currency->code,
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
    private function syncTranslations(Currency $currency, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                CurrencyTranslation::where('currency_id', $currency->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            CurrencyTranslation::updateOrCreate(
                ['currency_id' => $currency->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
