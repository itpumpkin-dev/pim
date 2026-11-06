<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Product Matching phase 3A — score-based ("ชื่อ/แบรนด์ใกล้เคียง")
 * suggestions for listings whose SKU simply isn't in PIM.
 *
 *  - pg_trgm: trigram similarity + GIN indexes for candidate retrieval.
 *    It's a "trusted" extension (PG13+), so a DB owner with CREATE on the
 *    database can install it without superuser. If it can't be created the
 *    migration still succeeds (no trigram indexes) and
 *    ListingScoreSuggester falls back to model-token-only candidates.
 *  - product_match_index: one denormalised row per PIM product — the EAV
 *    name (pname th/en), brand (pbrand), price (price_recommend) and model
 *    tokens flattened and NORMALISED for matching (name_th/name_en are
 *    search keys, not display names). Rebuilt by ProductMatchIndexBuilder
 *    (`marketplace:rebuild-match-index`, start of every listing sync run).
 *  - marketplace_listing_suggestions: the persisted top-3 score suggestions
 *    per unmatched listing (recomputed per shop after each sync and by
 *    `marketplace:suggest-matches`), so the page's tab counts stay cheap
 *    and "accept" can check that a suggestion is still current.
 */
return new class extends Migration
{
    /** CREATE EXTENSION failing must not abort the rest of the migration. */
    public $withinTransaction = false;

    public function up(): void
    {
        $trgm = false;
        if (DB::getDriverName() === 'pgsql') {
            try {
                DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
                $trgm = true;
            } catch (Throwable $e) {
                Log::warning('pg_trgm could not be created — product matching falls back to model-token candidates', ['error' => $e->getMessage()]);
            }
        }

        Schema::create('product_match_index', function (Blueprint $table) {
            $table->foreignId('product_id')->primary()->constrained('products')->cascadeOnDelete();
            $table->string('sku');
            $table->text('name_th')->nullable();
            $table->text('name_en')->nullable();
            $table->string('brand_code')->nullable();
            $table->string('brand_label')->nullable();
            $table->decimal('price', 12, 2)->nullable();
            // space-separated, upper-cased, hyphen-free model tokens
            // (" MG6001 LDM40AX 17906 "), leading/trailing space included
            $table->text('model_tokens')->nullable();
            $table->timestamp('updated_at')->nullable();
        });

        if ($trgm) {
            DB::statement('CREATE INDEX product_match_index_name_th_trgm ON product_match_index USING gin (name_th gin_trgm_ops)');
            DB::statement('CREATE INDEX product_match_index_name_en_trgm ON product_match_index USING gin (name_en gin_trgm_ops)');
        }

        Schema::create('marketplace_listing_suggestions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketplace_listing_id')->constrained('marketplace_listings')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->smallInteger('score');
            $table->json('reasons');
            $table->smallInteger('rank');
            $table->timestamp('created_at')->nullable();

            $table->unique(['marketplace_listing_id', 'product_id']);
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_listing_suggestions');
        Schema::dropIfExists('product_match_index');
        // pg_trgm is left installed — other code may come to rely on it.
    }
};
