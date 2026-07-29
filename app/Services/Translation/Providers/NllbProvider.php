<?php

namespace App\Services\Translation\Providers;

use App\Services\Translation\TranslationProviderInterface;
use Illuminate\Support\Facades\Http;

/**
 * Talks to a self-hosted NLLB-200 (facebook/nllb-200-distilled-600M by
 * default) inference server — see services/nllb-translation-server/ for a
 * ready-to-run FastAPI wrapper implementing the /translate contract this
 * provider expects. NLLB is a dedicated seq2seq translation model, not a
 * chat LLM, so it needs FLORES-200 language codes (e.g. "eng_Latn") rather
 * than the plain ISO codes ("en") locales use elsewhere in the app — this
 * class owns that mapping so nothing upstream has to know about it.
 */
class NllbProvider implements TranslationProviderInterface
{
    /**
     * ISO 639-1 locale code -> FLORES-200 code. Extend as new locales are
     * added; translateBatch() throws a clear error for anything missing
     * here rather than silently sending a code the server won't recognize.
     */
    private const LOCALE_TO_FLORES = [
        'en' => 'eng_Latn',
        'th' => 'tha_Thai',
        'es' => 'spa_Latn',
        'zh' => 'zho_Hans',
        'fr' => 'fra_Latn',
        'de' => 'deu_Latn',
        'ja' => 'jpn_Jpan',
        'ko' => 'kor_Hang',
        'vi' => 'vie_Latn',
        'id' => 'ind_Latn',
        'ru' => 'rus_Cyrl',
        'pt' => 'por_Latn',
        'ar' => 'arb_Arab',
        'hi' => 'hin_Deva',
        'it' => 'ita_Latn',
        'nl' => 'nld_Latn',
        'tr' => 'tur_Latn',
        'pl' => 'pol_Latn',
        'uk' => 'ukr_Cyrl',
        'ms' => 'zsm_Latn',
    ];

    public function translateBatch(array $texts, string $sourceLocale, string $targetLocale, array $credentials): array
    {
        $url = $credentials['url'] ?? null;

        if (! $url) {
            throw new \RuntimeException('NLLB provider is missing its server URL.');
        }

        $endpoint = rtrim($url, '/') . '/translate';

        $request = Http::timeout(60);

        if (! empty($credentials['api_key'])) {
            $request = $request->withToken($credentials['api_key']);
        }

        $response = $request->post($endpoint, [
            'texts' => $texts,
            'source_lang' => $this->toFlores($sourceLocale),
            'target_lang' => $this->toFlores($targetLocale),
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('NLLB server returned ' . $response->status() . ': ' . $response->body());
        }

        $translated = $response->json('translations');

        if (! is_array($translated) || count($translated) !== count($texts)) {
            throw new \RuntimeException('NLLB server returned an unexpected response shape.');
        }

        return array_map(fn ($value) => (string) $value, $translated);
    }

    public static function credentialFields(): array
    {
        return [
            ['key' => 'url', 'label' => 'Server URL (e.g. http://localhost:8000)', 'type' => 'text', 'required' => true],
            ['key' => 'api_key', 'label' => 'Bearer Token (optional)', 'type' => 'password', 'required' => false],
        ];
    }

    public static function label(): string
    {
        return 'NLLB-200 (Self-hosted)';
    }

    private function toFlores(string $locale): string
    {
        return self::LOCALE_TO_FLORES[$locale]
            ?? throw new \RuntimeException(
                "NLLB provider has no FLORES-200 mapping for locale \"{$locale}\". " .
                'Add it to NllbProvider::LOCALE_TO_FLORES.'
            );
    }
}
