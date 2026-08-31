<?php

namespace App\Services\Translation\Providers;

use App\Services\Translation\TranslationProviderInterface;
use Illuminate\Support\Facades\Http;

/**
 * Adapter สำหรับ Translate API ที่พัฒนาขึ้นเอง (FastAPI ครอบ Ollama /
 * translategemma — ดู main.py ของบริการนั้น) มีสองเรื่องที่ต่างจาก provider
 * อื่นในแอปนี้ ซึ่ง adapter ตัวนี้ปิดช่องให้:
 *
 *  1. ปลายทาง POST /translate รับ "ทีละข้อความ" ({text, source_lang,
 *     target_lang}) ไม่ใช่ batch — ตัวนี้เลยวนยิงทีละสตริงแล้วประกอบผลลัพธ์
 *     กลับตามลำดับเดิม (สัญญาของ interface บังคับว่า index ต้องตรงกับ input)
 *  2. ปลายทางรับ "ชื่อภาษาเต็ม" ('English', 'Thai') ไม่ใช่โค้ด ISO ('en',
 *     'th') ที่ระบบใช้ทุกที่ — adapter ถือ mapping ISO -> ชื่อภาษาไว้เอง
 *     เหมือนที่ NllbProvider ถือ mapping ISO -> FLORES-200
 */
class TranslateApiProvider implements TranslationProviderInterface
{
    /**
     * โค้ด locale ของแอป (Locale::code) -> ชื่อภาษาที่ Translate API เข้าใจ
     * เพิ่มรายการเมื่อมี locale ใหม่ ถ้าไม่เจอจะ throw error ที่บอกชัดว่าให้
     * มาเติมที่ไหน แทนที่จะส่งโค้ดที่โมเดลไม่รู้จักไปเงียบๆ
     */
    private const LOCALE_TO_NAME = [
        'en' => 'English',
        'th' => 'Thai',
        'zh' => 'Chinese',
        'ja' => 'Japanese',
        'es' => 'Spanish',
        'pt' => 'Portuguese',
        'lo' => 'Lao',
        'fr' => 'French',
        'de' => 'German',
        'vi' => 'Vietnamese',
        'id' => 'Indonesian',
        'ko' => 'Korean',
        'ms' => 'Malay',
    ];

    public function translateBatch(array $texts, string $sourceLocale, string $targetLocale, array $credentials): array
    {
        $url = $credentials['url'] ?? null;
        if (! $url) {
            throw new \RuntimeException('Translate API provider is missing its base URL.');
        }

        $endpoint = rtrim($url, '/') . '/translate';
        $source = $this->toLanguageName($sourceLocale);
        $target = $this->toLanguageName($targetLocale);

        $request = Http::timeout((int) ($credentials['timeout'] ?? 120))->acceptJson();
        if (! empty($credentials['api_key'])) {
            $request = $request->withToken($credentials['api_key']);
        }

        $out = [];

        foreach (array_values($texts) as $i => $text) {
            $text = (string) $text;

            // ปลายทางตอบ 422 ถ้า text ว่าง — คืนค่าเดิมไปเลย ไม่ต้องเสียรอบเรียก
            if (trim($text) === '') {
                $out[$i] = $text;
                continue;
            }

            $response = $request->post($endpoint, [
                'text' => $text,
                'source_lang' => $source,
                'target_lang' => $target,
            ]);

            if (! $response->successful()) {
                throw new \RuntimeException(
                    "Translate API returned {$response->status()} for item {$i}: " . $response->body()
                );
            }

            $translated = $response->json('translated_text');

            if (! is_string($translated) || trim($translated) === '') {
                throw new \RuntimeException("Translate API returned an empty translation for item {$i}.");
            }

            $out[$i] = $translated;
        }

        return $out;
    }

    public static function credentialFields(): array
    {
        return [
            ['key' => 'url', 'label' => 'Base URL (เช่น http://localhost:8000)', 'type' => 'text', 'required' => true],
            ['key' => 'api_key', 'label' => 'Bearer Token (ถ้ามี — ตอนนี้ API ยังไม่บังคับ)', 'type' => 'password', 'required' => false],
            ['key' => 'timeout', 'label' => 'Timeout ต่อข้อความ (วินาที, ค่าเริ่มต้น 120)', 'type' => 'text', 'required' => false],
        ];
    }

    public static function label(): string
    {
        return 'Translate API (In-house Gemma)';
    }

    private function toLanguageName(string $locale): string
    {
        return self::LOCALE_TO_NAME[$locale]
            ?? throw new \RuntimeException(
                "Translate API provider has no language-name mapping for locale \"{$locale}\". " .
                'Add it to TranslateApiProvider::LOCALE_TO_NAME.'
            );
    }
}
