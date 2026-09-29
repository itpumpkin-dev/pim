<?php

namespace App\Models\Concerns;

use Illuminate\Contracts\Encryption\DecryptException;

/**
 * Safe access to an `encrypted:array` `credentials` column.
 *
 * Values encrypted under a previous APP_KEY (key rotated, or the DB copied
 * from another environment) throw "The MAC is invalid." on read. Reading
 * through here treats them as "not set" instead, so the edit form still
 * opens and the user can simply re-enter the secret to re-encrypt it.
 */
trait HasEncryptedCredentials
{
    /**
     * @return array<string, mixed>
     */
    public function readableCredentials(): array
    {
        try {
            return $this->credentials ?? [];
        } catch (DecryptException) {
            return [];
        }
    }

    /**
     * Dirty-checking an encrypted column decrypts the stored original to
     * compare it — an undecryptable original would throw on save. Treat it
     * as changed so the freshly re-entered secret overwrites it.
     */
    public function originalIsEquivalent($key)
    {
        try {
            return parent::originalIsEquivalent($key);
        } catch (DecryptException) {
            return false;
        }
    }

    public function credentialsUnreadable(): bool
    {
        try {
            $this->credentials;

            return false;
        } catch (DecryptException) {
            return true;
        }
    }
}
