<?php

namespace App\Services\ImportExport;

/**
 * Declarative shape of one "simple master" entity (Brand, Base Unit, Point,
 * Commission Group, Business Type, Vendor, Currency, Product Grade, Product
 * Type — see MasterAttributeOptionSync::SOURCES for the same list, since
 * these are exactly the models that mirror into an attribute's options) for
 * MasterEntityRowImporter/MasterEntityRowExporter to drive generically,
 * instead of writing 9 near-identical Importer/Exporter class pairs.
 *
 * These 9 are structurally uniform enough (key column + a handful of plain
 * scalar fields + usually one {Entity}Translation table) for one generic
 * pair to cover all of them — CategoryRowImporter/CategoryRowExporter is
 * the hand-written precedent this generalizes from.
 */
class MasterEntityDefinition
{
    /**
     * @param  class-string<\Illuminate\Database\Eloquent\Model>  $modelClass
     * @param  string  $keyColumn  Column import rows are matched on
     *         (updateOrCreate's unique key) — 'code' for most, but Point has
     *         no code column at all and uses 'point_type' instead.
     * @param  array<int, string>  $fillable  Plain scalar columns beyond
     *         $keyColumn/$nameColumn to read/write verbatim (strings as-is).
     * @param  ?string  $nameColumn  The entity's main display/label column
     *         (e.g. 'name', or 'p_group_name' for CommissionGroup) — required
     *         on import. Null only if the entity has no separate label at all
     *         (none of the 9 currently need this, kept for completeness).
     * @param  ?class-string<\Illuminate\Database\Eloquent\Model>  $translationModelClass
     *         The {Entity}Translation model, or null when the entity has no
     *         translations table (Point, CommissionGroup) — $nameColumn is
     *         then the entity's only label, written directly with no source-
     *         locale/raw-column distinction.
     * @param  ?string  $translationForeignKey  FK column on the translation
     *         table pointing back to this entity (e.g. 'brand_id').
     * @param  array<int, string>  $booleanColumns  Columns coerced via the
     *         same "1/true/yes" parsing every other importer in this codebase
     *         uses, defaulting to active/true when the column is blank.
     * @param  array<int, string>  $dateColumns  Columns stored as Y-m-d dates
     *         — accepted as plain 'YYYY-MM-DD' strings, blank clears them.
     * @param  array<string, array{model: class-string<\Illuminate\Database\Eloquent\Model>, inputColumn: string, lookupColumn?: string}>  $fkLookups
     *         Maps a fillable FK column (e.g. 'currency_id') to how it's
     *         resolved from the row: which input column carries the human
     *         key (e.g. 'currency_code') and which column on the related
     *         model it's matched against (defaults to 'code').
     * @param  array<int, string>  $extraRequiredColumns  Columns beyond
     *         $keyColumn/$nameColumn that must be non-empty.
     */
    public function __construct(
        public readonly string $modelClass,
        public readonly string $keyColumn = 'code',
        public readonly array $fillable = [],
        public readonly ?string $nameColumn = 'name',
        public readonly ?string $translationModelClass = null,
        public readonly ?string $translationForeignKey = null,
        public readonly array $booleanColumns = ['is_active'],
        public readonly array $dateColumns = [],
        public readonly array $fkLookups = [],
        public readonly array $extraRequiredColumns = [],
    ) {
    }

    /**
     * Full ordered column list for the sample template / uploaded file:
     * key column, then every FK lookup's own input column (not the raw FK
     * column itself — a human never types a numeric id), then name, then
     * the rest of $fillable (skipping columns already covered by an FK
     * lookup), then translation label last if this entity has one.
     *
     * @return array<int, string>
     */
    public function columns(): array
    {
        $fkInputColumns = array_map(fn (array $fk) => $fk['inputColumn'], $this->fkLookups);
        $fkOwnColumns = array_keys($this->fkLookups);

        $columns = [$this->keyColumn, ...$fkInputColumns];
        if ($this->nameColumn !== null) {
            $columns[] = $this->nameColumn;
        }
        foreach ($this->fillable as $column) {
            if (!in_array($column, $fkOwnColumns, true)) {
                $columns[] = $column;
            }
        }

        return array_values(array_unique($columns));
    }

    /**
     * @return array<int, string>
     */
    public function requiredColumns(): array
    {
        $required = [$this->keyColumn];
        if ($this->nameColumn !== null) {
            $required[] = $this->nameColumn;
        }

        return array_values(array_unique([...$required, ...$this->extraRequiredColumns]));
    }
}
