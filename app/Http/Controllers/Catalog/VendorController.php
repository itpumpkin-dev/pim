<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Models\Vendor;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
                    ->orWhere('name_en', 'like', "%{$search}%")
                    ->orWhere('short_name', 'like', "%{$search}%");
            })
            ->orderBy($sort, $dir)
            ->paginate($perPage)
            ->withQueryString();

        $vendors->getCollection()->transform(function (Vendor $vendor) {
            $vendor->currency_code = $vendor->currency?->code;

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
        $vendor = Vendor::create($this->validatePayload($request));

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, $vendor->code, $vendor->name, $vendor->is_active);

        return to_route('catalog.vendors.index')->with('success', 'Vendor added successfully.');
    }

    public function edit(Vendor $vendor): Response
    {
        return Inertia::render('catalog/vendors/edit', [
            'vendor' => $vendor->only([
                'id', 'code', 'name', 'name_en', 'short_name', 'vendor_group', 'tax_id', 'branch',
                'tax_invoice_address_1', 'tax_invoice_address_2', 'tax_invoice_address_3', 'tax_invoice_address_4',
                'currency_id', 'payment_terms', 'default_price_term', 'remark',
                'contact_name', 'contact_position', 'contact_phone', 'contact_fax', 'contact_email',
                'contact_address_1', 'contact_address_2', 'contact_address_3', 'contact_address_4', 'contact_country',
                'is_active',
            ]),
            'currencies' => $this->currencyOptions(),
        ]);
    }

    public function update(Request $request, Vendor $vendor): RedirectResponse
    {
        $oldCode = $vendor->code;

        $vendor->update($this->validatePayload($request, $vendor));

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
            'name' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
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

        $validated['is_active'] = $request->boolean('is_active', true);

        return $validated;
    }
}
