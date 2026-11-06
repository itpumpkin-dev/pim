<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Product Matching phase 2 (additive):
 *
 *  - marketplace_listings.ignored_* — a person hid this listing from the
 *    "unmatched" work queue (e.g. a listing that genuinely has no PIM
 *    product). Ignored rows are never auto-matched by the sync.
 *  - marketplace_listing_components — bundle contents. A listing is EITHER
 *    a single link (marketplace_listings.product_id [+ pack_quantity]) OR a
 *    bundle (rows here, product_id NULL, match_method 'bundle'). See
 *    App\Models\MarketplaceListing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketplace_listings', function (Blueprint $table) {
            $table->timestamp('ignored_at')->nullable();
            $table->foreignId('ignored_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('ignore_reason')->nullable();
        });

        Schema::create('marketplace_listing_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketplace_listing_id')->constrained('marketplace_listings')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();

            $table->unique(['marketplace_listing_id', 'product_id']);
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_listing_components');

        Schema::table('marketplace_listings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ignored_by');
            $table->dropColumn(['ignored_at', 'ignore_reason']);
        });
    }
};
