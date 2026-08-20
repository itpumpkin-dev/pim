<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->string('slug')->nullable()->after('admin_label');
            $table->text('description')->nullable()->after('slug');
            $table->string('thumbnail')->nullable()->after('description');
            $table->foreignId('parent_id')->nullable()->after('attribute_id')
                ->constrained('attribute_options')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_id');
            $table->dropColumn(['slug', 'description', 'thumbnail']);
        });
    }
};
