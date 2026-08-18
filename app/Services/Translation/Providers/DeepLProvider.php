<?php

namespace App\Services\Translation\Providers;

use App\Services\Translation\TranslationProviderInterface;
use Illuminate\Support\Facades\Http;

/**
 * DeepL API — Free and Pro plans use different base URLs, distinguished by
 * DeepL's own key convention (Free-plan keys always end in ":fx"), so this
 * detects which endpoint to call instead of asking the admin to pick.
 *
 * DeepL doesn't cover every locale this app can be configured with (e.g.
 * Thai/Lao aren't in its supported-language list at the time this was
 * written) — an unsupported target locale fails the request, which the
 * caller already handles by logging a warning and leaving those strings on
 * their English fallback. Note this also means the "Test" button on the
 * provider list (which always translates English -> Thai) will report
 * failure for this provider even when it's configured correctly, since Thai
 * itself is the unsupported case.
 */
class DeepLProvider implements TranslationProviderInterface
{
    private const FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate';

    private const PRO_ENDPOINT = 'https://api.deepl.com/v2/translate';

    public function translateBatch(array $texts, string $sourceLocale, string $targetLocale, array $credentials): array
    {
        $apiKey = $credentials['api_key'] ?? null;

        if (! $apiKey) {
            throw new \RuntimeException('DeepL provider is missing its API key.');
        }

        $endpoint = str_ends_with($apiKey, ':fx') ? self::FREE_ENDPOINT : self::PRO_ENDPOINT;

        $response = Http::timeout(45)
            ->withHeaders(['Authorization' => 'DeepL-Auth-Key ' . $apiKey])
            ->post($endpoint, [
                'text' => $texts,
                'source_lang' => strtoupper($sourceLocale),
                'target_lang' => strtoupper($targetLocale),
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('DeepL returned ' . $response->status() . ': ' . $response->body());
        }

        $translations = $response->json('translations');

        if (! is_array($translations) || count($translations) !== count($texts)) {
            throw new \RuntimeException('DeepL returned an unexpected response shape.');
        }

        return array_map(fn (array $translation) => (string) ($translation['text'] ?? ''), $translations);
    }

    public static function credentialFields(): array
    {
        return [
            ['key' => 'api_key', 'label' => 'API Key', 'type' => 'password', 'required' => true],
        ];
    }

    public static function label(): string
    {
        return 'DeepL';
    }
}
