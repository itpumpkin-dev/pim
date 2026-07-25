<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Channel;
use App\Models\ChannelTranslation;
use App\Models\Currency;
use App\Models\Locale;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ChannelController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->input('search');

        $channels = Channel::with(['rootCategory'])
            ->when($search, function ($query, $search) {
                $query->where('code', 'like', "%{$search}%")
                    ->orWhereHas('translations', function ($q) use ($search) {
                        $q->where('name', 'like', "%{$search}%");
                    });
            })
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('catalog/channels/index', [
            'channels' => $channels,
            'filters' => $request->only(['search']),
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
        $validated = $this->validateChannel($request);

        $channel = Channel::create([
            'code' => $validated['code'],
            'root_category_id' => $validated['root_category_id'] ?? null,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

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
        ]);
    }

    public function update(Request $request, Channel $channel): RedirectResponse
    {
        $validated = $this->validateChannel($request, $channel->id);

        $oldTranslations = $this->currentTranslations($channel);
        $oldLocaleIds = $channel->locales()->pluck('locales.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
        $oldCurrencyIds = $channel->currencies()->pluck('currencies.id')->map(fn ($id) => (int) $id)->sort()->values()->all();

        $channel->update([
            'code' => $validated['code'],
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

        return to_route('catalog.channels.index')->with('success', 'Channel updated successfully.');
    }

    public function destroy(Channel $channel): RedirectResponse
    {
        $channel->delete();

        return to_route('catalog.channels.index')->with('success', 'Channel deleted successfully.');
    }

    private function validateChannel(Request $request, ?int $channelId = null): array
    {
        return $request->validate([
            'code' => ['required', 'string', 'max:50', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:channels,code' . ($channelId ? ",{$channelId}" : '')],
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
     * Fresh (uncached) locale_id => name map for the channel's current
     * translations — used to snapshot before/after state for audit diffs.
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
