<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeApiSource;
use App\Models\AttributeOption;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The external-API counterpart to MasterAttributeOptionSync — a `select`/
 * `multiselect` attribute can bind to an AttributeApiSource instead of a
 * master_source, and its option list is rebuilt from that API's response
 * the same way (same is_customized-preserving upsert, via the shared
 * AttributeOptionMirror). Unlike master sources there are no Eloquent model
 * events to hook into (the source of truth lives outside this app), so
 * syncing only ever happens on demand: when the attribute is saved bound to
 * a source, from `catalog:sync-api-options`, or via the source's own "Sync
 * now" action in AttributeApiSourceController.
 */
class ApiAttributeOptionSync
{
    public function __construct(private AttributeOptionMirror $mirror)
    {
    }

    public function rebuildAttribute(Attribute $attribute): void
    {
        $source = $attribute->api_source_id !== null
            ? AttributeApiSource::find($attribute->api_source_id)
            : null;

        if ($source === null) {
            AttributeOption::where('attribute_id', $attribute->id)->get()->each->delete();

            return;
        }

        $rows = $this->mapRows($this->fetchBody($source), $source);

        // A source that suddenly maps zero rows (wrong path after an
        // upstream schema change, an API returning an empty page for a
        // transient reason, ...) still responds 200 — fetchBody() alone
        // can't tell that apart from "this source is genuinely empty".
        // Since there's no way to tell those apart here, refuse to prune an
        // attribute that already has options down to nothing on an empty
        // result rather than silently wiping everything (customized options
        // included) on what may just be a flaky response; a source that
        // legitimately has no rows yet (brand new, never synced) is still
        // a no-op either way.
        if (empty($rows) && AttributeOption::where('attribute_id', $attribute->id)->exists()) {
            throw new \RuntimeException("API source \"{$source->name}\" mapped zero rows — leaving existing options untouched instead of deleting them all.");
        }

        $currentCodes = collect($rows)->map(fn ($row) => $this->mirror->normaliseCode($row['code']))->filter()->all();

        AttributeOption::where('attribute_id', $attribute->id)
            ->whereNotIn('code', $currentCodes)
            ->get()
            ->each->delete();

        foreach ($rows as $row) {
            $this->mirror->upsertOption($attribute->id, $row);
        }
    }

    /**
     * Rebuild every attribute bound to an AttributeApiSource. Returns the
     * count that synced successfully. Unlike MasterAttributeOptionSync's
     * rebuildAll() (internal tables — effectively always reachable), each
     * attribute here is an independent external HTTP call that can fail on
     * its own (one source down/misconfigured shouldn't abort every other
     * attribute's resync), so failures are caught and logged per-attribute
     * instead of aborting the whole run.
     */
    public function rebuildAll(): int
    {
        $count = 0;
        Attribute::whereNotNull('api_source_id')->get()->each(function (Attribute $attribute) use (&$count) {
            try {
                $this->rebuildAttribute($attribute);
                $count++;
            } catch (\Throwable $e) {
                Log::warning("ApiAttributeOptionSync: failed to sync attribute #{$attribute->id} ({$attribute->code}): {$e->getMessage()}");
            }
        });

        return $count;
    }

    /**
     * Fetch and map a source's rows without writing anything — used by the
     * "Test connection" button on the API source form so an admin can check
     * their path config before saving/binding any attribute to it.
     *
     * @return array<int, array{code: string, label: ?string, is_active?: bool}>
     */
    public function preview(AttributeApiSource $source, int $limit = 10): array
    {
        return array_slice($this->mapRows($this->fetchBody($source), $source), 0, $limit);
    }

    /** @return array<int, array{code: string, label: ?string, is_active?: bool}> */
    private function mapRows(array $body, AttributeApiSource $source): array
    {
        $list = $source->rows_path ? Arr::get($body, $source->rows_path) : $body;
        if (! is_array($list)) {
            throw new \RuntimeException("Rows path \"{$source->rows_path}\" did not resolve to a list in the response.");
        }

        $rows = [];
        foreach ($list as $item) {
            if (! is_array($item)) {
                continue;
            }

            $code = Arr::get($item, $source->code_path);
            if ($code === null || $code === '') {
                continue;
            }

            $row = [
                'code' => (string) $code,
                'label' => (string) (Arr::get($item, $source->label_path) ?? $code),
            ];

            if ($source->is_active_path) {
                $row['is_active'] = (bool) Arr::get($item, $source->is_active_path, true);
            }

            $rows[] = $row;
        }

        return $rows;
    }

    private function fetchBody(AttributeApiSource $source): array
    {
        $request = Http::timeout(30);
        $request = $this->applyAuth($request, $source);

        $response = $request->send($source->method, $source->endpoint);

        if (! $response->successful()) {
            throw new \RuntimeException("API source \"{$source->name}\" returned {$response->status()}: {$response->body()}");
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw new \RuntimeException("API source \"{$source->name}\" did not return a JSON object/array.");
        }

        return $json;
    }

    private function applyAuth(PendingRequest $request, AttributeApiSource $source): PendingRequest
    {
        $credentials = $source->credentials ?? [];

        return match ($source->auth_type) {
            'api_key_header' => $request->withHeaders([
                (string) ($credentials['header_name'] ?? 'X-Api-Key') => (string) ($credentials['api_key'] ?? ''),
            ]),
            'bearer' => $request->withToken((string) ($credentials['token'] ?? '')),
            'basic' => $request->withBasicAuth(
                (string) ($credentials['username'] ?? ''),
                (string) ($credentials['password'] ?? ''),
            ),
            default => $request,
        };
    }
}
