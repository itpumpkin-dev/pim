<?php

namespace App\Services\Translation;

use App\Services\Translation\Providers\DeepLProvider;
use App\Services\Translation\Providers\GoogleCloudTranslateProvider;
use App\Services\Translation\Providers\LibreTranslateProvider;
use App\Services\Translation\Providers\NllbProvider;
use App\Services\Translation\Providers\OllamaProvider;

class TranslationProviderRegistry
{
    public const TYPES = ['libretranslate', 'google_cloud_translate', 'ollama', 'nllb', 'deepl'];

    public static function resolve(string $type): TranslationProviderInterface
    {
        return match ($type) {
            'libretranslate' => new LibreTranslateProvider(),
            'google_cloud_translate' => new GoogleCloudTranslateProvider(),
            'ollama' => new OllamaProvider(),
            'nllb' => new NllbProvider(),
            'deepl' => new DeepLProvider(),
            default => throw new \InvalidArgumentException("Unknown translation provider type: {$type}"),
        };
    }

    /**
     * Type -> {label, fields} schema consumed by the admin form to render
     * the right credential inputs for whichever type is selected, with no
     * per-type frontend code.
     *
     * @return array<string, array{label: string, fields: array}>
     */
    public static function schema(): array
    {
        $schema = [];

        foreach (self::TYPES as $type) {
            $class = self::classFor($type);
            $schema[$type] = [
                'label' => $class::label(),
                'fields' => $class::credentialFields(),
            ];
        }

        return $schema;
    }

    public static function supportsDynamicOptions(string $type): bool
    {
        return is_a(self::classFor($type), HasDynamicCredentialOptions::class, true);
    }

    /**
     * @return class-string<TranslationProviderInterface>
     */
    private static function classFor(string $type): string
    {
        return match ($type) {
            'libretranslate' => LibreTranslateProvider::class,
            'google_cloud_translate' => GoogleCloudTranslateProvider::class,
            'ollama' => OllamaProvider::class,
            'nllb' => NllbProvider::class,
            'deepl' => DeepLProvider::class,
            default => throw new \InvalidArgumentException("Unknown translation provider type: {$type}"),
        };
    }
}
