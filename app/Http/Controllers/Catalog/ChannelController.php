<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
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
        $channel->locales()->sync($validated['locale_ids']);
        $channel->currencies()->sync($validated['currency_ids']);

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

        $channel->update([
            'code' => $validated['code'],
            'root_category_id' => $validated['root_category_id'] ?? null,
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($channel, $validated['translations'] ?? []);
        $channel->locales()->sync($validated['locale_ids']);
        $channel->currencies()->sync($validated['currency_ids']);

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
