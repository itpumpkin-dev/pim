<?php

namespace App\Services\Translation;

/**
 * Optional capability a provider can implement when one of its credential
 * fields (declared via credentialFields()) should be a dropdown populated
 * from a live call to the provider's own API — e.g. Ollama listing which
 * models are actually installed on the configured server — instead of a
 * field the admin has to type by hand.
 */
interface HasDynamicCredentialOptions
{
    /**
     * @param array<string, mixed> $credentials whatever credential values have been entered so far (e.g. just "url")
     * @return array<int, array{value: string, label: string}>
     */
    public function fetchOptions(string $fieldKey, array $credentials): array;
}
