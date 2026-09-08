<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `2026_08_25_013412_add_category_and_mandatory_to_lazada_attributes_table`
 * is recorded as already run in this environment's `migrations` table, but
 * the columns it adds (`category_id`, `mandatory`) were confirmed live to
 * not actually exist on `lazada_attributes` here — some earlier setup of
 * this database's schema drifted from its migration history (this same
 * table also carries `options`/`label_th` columns that no migration in this
 * codebase ever created, the mirror-image of this same drift). Re-running
 * that old migration isn't an option once Laravel considers it applied, so
 * this backfills the same two columns under a new migration instead.
 *
 * Guarded with hasColumn() checks (unlike the original, which assumed a
 * clean slate) so this is safe to run in an environment where the columns
 * genuinely are already present — it becomes a no-op there instead of
 * erroring on a duplicate column.
 *
 * Without `category_id`, LazadaAttributeMappingController::
 * lazadaAttributesForCategory() silently skips its per-category filter
 * (`if (Schema::hasColumn(...))`) and returns every synced Lazada attribute
 * across every category at once — this is what fixes that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lazada_attributes', function (Blueprint $table) {
            if (!Schema::hasColumn('lazada_attributes', 'category_id')) {
                $table->unsignedBigInteger('category_id')->nullable();
            }
            if (!Schema::hasColumn('lazada_attributes', 'mandatory')) {
                $table->boolean('mandatory')->nullable();
            }
        });

        if (!$this->hasForeignKey('lazada_attributes', 'category_id')) {
            Schema::table('lazada_attributes', function (Blueprint $table) {
                $table->foreign('category_id')->references('id')->on('lazada_categories')->nullOnDelete();
                $table->index('category_id');
            });
        }
    }

    public function down(): void
    {
        Schema::table('lazada_attributes', function (Blueprint $table) {
            if ($this->hasForeignKey('lazada_attributes', 'category_id')) {
                $table->dropForeign(['category_id']);
            }
            $table->dropColumn(array_filter([
                Schema::hasColumn('lazada_attributes', 'category_id') ? 'category_id' : null,
                Schema::hasColumn('lazada_attributes', 'mandatory') ? 'mandatory' : null,
            ]));
        });
    }

    /**
     * doctrine/dbal isn't installed in this app (Laravel 12 no longer
     * requires it for the schema builder), so this reads Postgres' own
     * information_schema directly instead — needed because this migration
     * must be re-runnable without erroring in an environment where a prior
     * partial run already added the constraint.
     */
    private function hasForeignKey(string $table, string $column): bool
    {
        $rows = DB::select(
            "select 1
             from information_schema.table_constraints tc
             join information_schema.key_column_usage kcu
               on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
             where tc.table_schema = current_schema()
               and tc.table_name = ?
               and tc.constraint_type = 'FOREIGN KEY'
               and kcu.column_name = ?",
            [$table, $column]
        );

        return count($rows) > 0;
    }
};
