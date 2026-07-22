<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->foreignId('parent_id')->nullable()->after('code')->constrained('categories')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->after('parent_id')->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('parent_id', 'idx_categories_parent_id');
            $table->index('created_by', 'idx_categories_created_by');
            $table->index('updated_by', 'idx_categories_updated_by');
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropForeign(['parent_id']);
            $table->dropForeign(['created_by']);
            $table->dropForeign(['updated_by']);
            $table->dropColumn(['parent_id', 'created_by', 'updated_by', 'created_at', 'updated_at']);
        });
    }
};
