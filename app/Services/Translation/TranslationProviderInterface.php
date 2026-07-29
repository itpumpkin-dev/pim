<?php

namespace App\Services\Translation;

interface TranslationProviderInterface
{
    /**
     * Translates a batch of strings, returning translations in the same
     * order as $texts. Throws on any failure (network, auth, malformed
     * response) — callers are responsible for catching and degrading
     * gracefully.
     *
     * @param array<int, string> $texts
     * @param array<string, mixed> $credentials keyed by this provider's credentialFields()
     * @return array<int, string>
     */
    public function translateBatch(array $texts, string $sourceLocale, string $targetLocale, array $credentials): array;

    /**
     * Describes the credential fields this provider needs, so the admin
     * form can render the right inputs without any per-type frontend code.
     * A field may set 'dynamic' => true (see HasDynamicCredentialOptions)
     * to be rendered as a dropdown fetched from the provider's own API
     * instead of free text.
     *
     * @return array<int, array{key: string, label: string, type: string, required: bool, dynamic?: bool}>
     */
    public static function credentialFields(): array;

    public static function label(): string;
}
