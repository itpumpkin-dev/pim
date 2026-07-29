<?php

namespace App\Services\Translation\Providers;

use App\Services\Translation\TranslationProviderInterface;
use Illuminate\Support\Facades\Http;

/**
 * Google Cloud Translation "Basic" (v2) REST API — API-key authenticated,
 * no service-account/OAuth setup required.
 */
class GoogleCloudTranslateProvider implements TranslationProviderInterface
{
    private const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

    public function translateBatch(array $texts, string $sourceLocale, string $targetLocale, array $credentials): array
    {
        $apiKey = $credentials['api_key'] ?? null;

        if (! $apiKey) {
            throw new \RuntimeException('Google Cloud Translate provider is missing its API key.');
        }

        $response = Http::timeout(45)->post(self::ENDPOINT . '?key=' . urlencode($apiKey), [
            'q' => $texts,
            'source' => $sourceLocale,
            'target' => $targetLocale,
            'format' => 'text',
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Google Cloud Translate returned ' . $response->status() . ': ' . $response->body());
        }

        $translations = $response->json('data.translations');

        if (! is_array($translations) || count($translations) !== count($texts)) {
            throw new \RuntimeException('Google Cloud Translate returned an unexpected response shape.');
        }

        return array_map(fn (array $translation) => (string) ($translation['translatedText'] ?? ''), $translations);
    }

    public static function credentialFields(): array
    {
        return [
            ['key' => 'api_key', 'label' => 'API Key', 'type' => 'password', 'required' => true],
        ];
    }

    public static function label(): string
    {
        return 'Google Cloud Translate';
    }
}
