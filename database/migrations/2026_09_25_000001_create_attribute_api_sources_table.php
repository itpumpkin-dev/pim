<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An admin-configured external API an attribute's options can mirror
     * from — the same idea as `attributes.master_source`, but pointed at an
     * arbitrary HTTP endpoint instead of an internal table. See
     * App\Services\Catalog\ApiAttributeOptionSync for how rows_path/
     * code_path/label_path/is_active_path resolve a response into option
     * rows, and App\Models\TranslationProvider for why `credentials` is a
     * plain nullable text column decrypted via the model's `encrypted:array`
     * cast rather than a native json column.
     */
    public function up(): void
    {
        Schema::create('attribute_api_sources', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('endpoint', 2048);
            $table->string('method', 10)->default('GET');
            $table->string('auth_type', 30)->default('none');
            $table->text('credentials')->nullable();
            $table->string('rows_path')->nullable();
            $table->string('code_path');
            $table->string('label_path');
            $table->string('is_active_path')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_api_sources');
    }
};
