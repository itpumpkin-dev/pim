<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Product Matching phase 4A — one row per listing sync of one shop, written
 * by MarketplaceListingSyncRunner (shared by the page's button/job, the
 * `marketplace:sync-listings` command and the nightly schedule).
 *
 *   trigger  schedule | manual (button → queued job) | command
 *   status   running | success | failed — a 'running' row older than 6h is
 *            marked failed at the start of the next run (worker killed etc.)
 *   stats    the sync's counters (fetched/upserted/deleted/matched/
 *            unmatched/suggested)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketplace_listing_sync_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_platform_shop_id')->constrained('sales_platform_shops')->cascadeOnDelete();
            $table->string('trigger', 16);
            $table->string('status', 16);
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->json('stats')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['sales_platform_shop_id', 'started_at']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_listing_sync_runs');
    }
};
