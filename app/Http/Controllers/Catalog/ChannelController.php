<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Channel;
use App\Models\ChannelTranslation;
use App\Models\Currency;
use App\Models\Locale;
use App\Services\CodeGenerator;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ChannelController extends Controller
{
    use HasVersionHistory;

    public function index(Request $request): Response
    {
        $search = $request->input('search');

        // มีแค่ `code` เท่านั้นที่เป็นคอลัมน์จริงแบบ simple-type ใน `channels` — ส่วน `name`
        // เป็น accessor ที่ดึงมาจากตาราง translation เลยใช้ where clause ธรรมดากรองไม่ได้
        $filterColumns = [
            'code' => ['label' => 'Code', 'type' => 'string', 'filterable' => true],
        ];

        $query = Channel::with(['rootCategory'])
            ->when($search, function ($query, $search) {
                $query->where('code', 'like', "%{$search}%")
                    ->orWhereHas('translations', function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%");
                    });
            })
            ->orderBy('id', 'desc');

        GridManager::applyFilters($query, $filterColumns, (array) $request->input('filters', []));

        $channels = $query->paginate(15)->withQueryString();

        return Inertia::render('catalog/channels/index', [
            'channels' => $channels,
            'filters' => $request->only(['search', 'filters']),
            'filterColumns' => $filterColumns,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/channels/create', [
            'rootCategories' => Category::getTreeOptions(),
            'locales' => Locale::where('enabled', true)->get(['id', 'code', 'display_name']),
            'currencies' => Currency::orderBy('code')->get(['id', 'code', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'root_category_id' => ['nullable', 'exists:categories,id'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'locale_ids' => ['required', 'array', 'min:1'],
            'locale_ids.*' => ['exists:locales,id'],
            'currency_ids' => ['required', 'array', 'min:1'],
            'currency_ids.*' => ['exists:currencies,id'],
        ]);

        $channel = CodeGenerator::createWithRetry('channels', 'channel', fn ($code) => Channel::create([
            'code' => $code,
            'root_category_id' => $validated['root_category_id'] ?? null,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]), maxLength: 50);

        $this->syncTranslations($channel, $validated['translations'] ?? []);
        $newTranslations = $this->currentTranslations($channel);
        if (!empty($newTranslations)) {
            AuditLog::record('labels_set', $channel, null, $newTranslations);
        }

        $channel->locales()->sync($validated['locale_ids']);
        $channel->currencies()->sync($validated['currency_ids']);
        AuditLog::record('locales_currencies_set', $channel, null, [
            'locale_ids' => $validated['locale_ids'],
            'currency_ids' => $validated['currency_ids'],
        ]);

        Channel::bumpListVersion();

        return to_route('catalog.channels.index')->with('success', 'Channel created successfully.');
    }

    public function edit(Channel $channel): Response
    {
        return Inertia::render('catalog/channels/edit', [
            'channel' => $channel->only(['id', 'code', 'root_category_id']),
            'translations' => $channel->translations()->get()
                ->mapWithKeys(fn (ChannelTranslation $t) => [(string) $t->locale_id => $t->name]),
            'localeIds' => $channel->locales()->pluck('locales.id'),
            'currencyIds' => $channel->currencies()->pluck('currencies.id'),
            'rootCategories' => Category::getTreeOptions(),
            'locales' => Locale::where('enabled', true)->get(['id', 'code', 'display_name']),
            'currencies' => Currency::orderBy('code')->get(['id', 'code', 'name']),
            'canViewHistory' => auth()->user()?->hasPermission('channels', 'view_history') ?? false,
        ]);
    }

    public function history(Channel $channel): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($channel)]);
    }

    public function update(Request $request, Channel $channel): RedirectResponse
    {
        $validated = $this->validateChannel($request);

        $oldTranslations = $this->currentTranslations($channel);
        $oldLocaleIds = $channel->locales()->pluck('locales.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        $oldCurrencyIds = $channel->currencies()->pluck('currencies.id')->map(fn ($id) => (int) $id)->sort()->values()->all();

        $channel->update([
            'root_category_id' => $validated['root_category_id'] ?? null,
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($channel, $validated['translations'] ?? []);
        $newTranslations = $this->currentTranslations($channel);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $channel, $oldTranslations, $newTranslations);
        }

        $channel->locales()->sync($validated['locale_ids']);
        $channel->currencies()->sync($validated['currency_ids']);

        $newLocaleIds = collect($validated['locale_ids'])->map(fn ($id) => (int) $id)->sort()->values()->all();
        $newCurrencyIds = collect($validated['currency_ids'])->map(fn ($id) => (int) $id)->sort()->values()->all();

        if ($oldLocaleIds !== $newLocaleIds) {
            AuditLog::record('locales_updated', $channel, ['locale_ids' => $oldLocaleIds], ['locale_ids' => $newLocaleIds]);
        }
        if ($oldCurrencyIds !== $newCurrencyIds) {
            AuditLog::record('currencies_updated', $channel, ['currency_ids' => $oldCurrencyIds], ['currency_ids' => $newCurrencyIds]);
        }

        Channel::bumpListVersion();

        return to_route('catalog.channels.index')->with('success', 'Channel updated successfully.');
    }

    public function destroy(Channel $channel): RedirectResponse
    {
        $channel->delete();

        Channel::bumpListVersion();

        return to_route('catalog.channels.index')->with('success', 'Channel deleted successfully.');
    }


    private function validateChannel(Request $request): array
    {
        return $request->validate([
            'root_category_id' => ['nullable', 'exists:categories,id'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'locale_ids' => ['required', 'array', 'min:1'],
            'locale_ids.*' => ['exists:locales,id'],
            'currency_ids' => ['required', 'array', 'min:1'],
            'currency_ids.*' => ['exists:currencies,id'],
        ]);
    }

    /**
     * ดึง locale_id => name ของ translation ปัจจุบันของ channel แบบสดๆ (ไม่ผ่าน cache)
     * เอาไว้เก็บสแนปช็อตก่อน/หลังสำหรับเทียบความต่างตอนทำ audit log
     */
    private function currentTranslations(Channel $channel): array
    {
        return $channel->translations()->get()
            ->mapWithKeys(fn (ChannelTranslation $t) => [(string) $t->locale_id => $t->name])
            ->all();
    }

    private function syncTranslations(Channel $channel, array $translations): void
    {
        foreach ($translations as $localeId => $name) {
            $name = is_string($name) ? trim($name) : '';

            if ($name === '') {
                ChannelTranslation::where('channel_id', $channel->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            ChannelTranslation::updateOrCreate(
                ['channel_id' => $channel->id, 'locale_id' => $localeId],
                ['name' => $name]
            );
        }
    }
}
