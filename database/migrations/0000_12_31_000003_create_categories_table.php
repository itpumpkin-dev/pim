<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Minimal stand-in for the categories table referenced by users.default_tree_id.
     * The full catalog/category tree schema is expected to replace this later.
     */
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
