<?php

namespace App\Http\Controllers\Catalog\Concerns;

/**
 * Superseded. Mirroring a master row into a `select` attribute's options is
 * now driven by `attributes.master_source` (chosen on the attribute's edit
 * page) and applied by App\Services\Catalog\MasterAttributeOptionSync via
 * model events wired in AppServiceProvider — for every master, including
 * imports and tinker, not just controller CRUD.
 *
 * The methods are kept as no-ops so the existing `$this->syncAttributeOptionMirror(...)`
 * / `removeAttributeOptionMirror(...)` calls in the master controllers
 * (Points / Commission Groups / Business Types / Vendors / Currencies)
 * don't need touching; they can be deleted whenever those files are next
 * edited.
 */
trait SyncsAttributeOptionMirror
{
    private function syncAttributeOptionMirror(string $attributeCode, ?string $oldCode, string $newCode, ?string $label, bool $isActive = true): void
    {
        // no-op — see trait docblock
    }

    private function removeAttributeOptionMirror(string $attributeCode, string $code): void
    {
        // no-op — see trait docblock
    }
}
