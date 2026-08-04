<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_platform_shops', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sales_platform_id')->constrained('sales_platforms')->cascadeOnDelete();
            $table->string('code', 100);
            $table->string('name');
            // References n8n's lazada_tokens.id on a separate Postgres instance
            // (see the 'n8n' connection in config/database.php) — no real FK
            // constraint is possible across databases, so this is resolved in
            // application code via LazadaSellerAccount::on('n8n')->find(...).
            $table->unsignedBigInteger('lazada_seller_account_id')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['sales_platform_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_platform_shops');
    }
};
