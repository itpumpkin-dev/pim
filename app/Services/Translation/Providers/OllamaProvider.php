<?php

namespace App\Services\Translation\Providers;

use App\Services\Translation\HasDynamicCredentialOptions;
use App\Services\Translation\TranslationProviderInterface;
use Illuminate\Support\Facades\Http;

/**
 * Ollama (self-hosted local/private LLM) has no dedicated translate
 * endpoint — it's a general chat/completion API — so this prompts whatever
 * model is configured to translate the batch and forces JSON-shaped output
 * (Ollama's `format: "json"` option) so the response can be parsed
 * reliably instead of scraping free-form prose.
 */
class OllamaProvider implements TranslationProviderInterface, HasDynamicCredentialOptions
{
    public function translateBatch(array $texts, string $sourceLocale, string $targetLocale, array $credentials): array
    {
        $url = $credentials['url'] ?? null;
        $model = $credentials['model'] ?? null;

        if (! $url) {
            throw new \RuntimeException('Ollama provider is missing its server URL.');
        }

        if (! $model) {
            throw new \RuntimeException('Ollama provider is missing its model name.');
        }

        $endpoint = rtrim($url, '/') . '/api/generate';

        $prompt = sprintf(
            "You are a translation engine. Translate each string in the JSON array below from \"%s\" to \"%s\".\n" .
            "Rules:\n" .
            "- Reply with ONLY a JSON object of the exact shape {\"translations\": [...]}, nothing else — no markdown, no explanation.\n" .
            "- The \"translations\" array must contain exactly %d items, in the same order as the input.\n" .
            "- Tokens matching the pattern xph<number>ph (e.g. xph0ph) are placeholders — copy them through completely unchanged, do not translate or alter them.\n\n" .
            'Input: %s',
            $sourceLocale,
            $targetLocale,
            count($texts),
            json_encode($texts, JSON_UNESCAPED_UNICODE),
        );

        $request = Http::timeout(120);

        if (! empty($credentials['api_key'])) {
            $request = $request->withToken($credentials['api_key']);
        }

        // Local LLM inference is slow, especially on CPU — this provider
        // gets a much longer timeout than the dedicated MT APIs.
        $response = $request->post($endpoint, [
            'model' => $model,
            'prompt' => $prompt,
            'stream' => false,
            'format' => 'json',
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Ollama returned ' . $response->status() . ': ' . $response->body());
        }

        $decoded = json_decode((string) $response->json('response'), true);
        $translated = $decoded['translations'] ?? null;

        if (! is_array($translated) || count($translated) !== count($texts)) {
            throw new \RuntimeException('Ollama returned an unexpected response shape.');
        }

        return array_map(fn ($value) => (string) $value, $translated);
    }

    public static function credentialFields(): array
    {
        return [
            ['key' => 'url', 'label' => 'Server URL (e.g. http://localhost:11434)', 'type' => 'text', 'required' => true],
            ['key' => 'model', 'label' => 'Model name', 'type' => 'text', 'required' => true, 'dynamic' => true],
            ['key' => 'api_key', 'label' => 'Bearer Token (optional, for proxied instances)', 'type' => 'password', 'required' => false],
        ];
    }

    public static function label(): string
    {
        return 'Ollama (Local LLM)';
    }

    /**
     * Lists models actually installed on the configured Ollama server, so
     * "Model name" can be a dropdown instead of free text the admin has to
     * get exactly right (Ollama model tags are easy to typo).
     */
    public function fetchOptions(string $fieldKey, array $credentials): array
    {
        if ($fieldKey !== 'model') {
            return [];
        }

        $url = $credentials['url'] ?? null;

        if (! $url) {
            throw new \RuntimeException('Enter the Server URL above first, then load models.');
        }

        $response = Http::timeout(10)->get(rtrim($url, '/') . '/api/tags');

        if (! $response->successful()) {
            throw new \RuntimeException('Could not reach ' . $url . ' (returned ' . $response->status() . '). Is Ollama running there?');
        }

        return collect($response->json('models') ?? [])
            ->filter(fn (array $model) => filled($model['name'] ?? null))
            ->map(fn (array $model) => [
                'value' => $model['name'],
                'label' => $model['name'] . ' (' . round(($model['size'] ?? 0) / 1e9, 1) . ' GB)',
            ])
            ->values()
            ->all();
    }
}
