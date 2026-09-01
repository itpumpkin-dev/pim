<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\Currency;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
 */
class CurrencyController extends Controller
{
    use SyncsAttributeOptionMirror;

    private const MIRROR_ATTRIBUTE = 'purchase_currency';
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $sortable = ['code', 'name'];
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
        $currency = Currency::create($this->validatePayload($request));

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, strtolower($currency->code), $currency->name);

        return to_route('catalog.currencies.index')->with('success', 'Currency added successfully.');
    }

    public function edit(Currency $currency): Response
    {
        return Inertia::render('catalog/currencies/edit', [
            'currency' => $currency->only(['id', 'code', 'name']),
        ]);
    }

    public function update(Request $request, Currency $currency): RedirectResponse
    {
        $oldCode = strtolower($currency->code);

        $currency->update($this->validatePayload($request, $currency));

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
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Currency $currency = null): array
    {
        return $request->validate([
            'code' => [
                'required',
                'string',
                'max:10',
                Rule::unique('currencies', 'code')->ignore($currency?->id),
            ],
            'name' => ['required', 'string', 'max:255'],
        ]);
    }
}
