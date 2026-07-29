<?php

namespace App\Services\Translation\Providers;

use App\Services\Translation\TranslationProviderInterface;
use Illuminate\Support\Facades\Http;

class LibreTranslateProvider implements TranslationProviderInterface
{
    public function translateBatch(array $texts, string $sourceLocale, string $targetLocale, array $credentials): array
    {
        $url = $credentials['url'] ?? null;

        if (! $url) {
            throw new \RuntimeException('LibreTranslate provider is missing its API URL.');
        }

        // LibreTranslate only accepts batched (array) "q" values in a JSON
        // body — form-encoded "q[]=..." is rejected, so post JSON here.
        $response = Http::timeout(45)->post($url, array_filter([
            'q' => $texts,
            'source' => $sourceLocale,
            'target' => $targetLocale,
            'format' => 'text',
            'api_key' => $credentials['api_key'] ?? null,
        ]));

        if (! $response->successful()) {
            throw new \RuntimeException('LibreTranslate returned ' . $response->status() . ': ' . $response->body());
        }

        $translated = $response->json('translatedText');

        if (! is_array($translated) || count($translated) !== count($texts)) {
            throw new \RuntimeException('LibreTranslate returned an unexpected response shape.');
        }

        return $translated;
    }

    public static function credentialFields(): array
    {
        return [
            ['key' => 'url', 'label' => 'API URL', 'type' => 'text', 'required' => true],
            ['key' => 'api_key', 'label' => 'API Key (optional)', 'type' => 'password', 'required' => false],
        ];
    }

    public static function label(): string
    {
        return 'LibreTranslate';
    }
}
