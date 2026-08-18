<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('woo_category_aliases', function (Blueprint $table) {
            $table->id();
            $table->string('match_key')->unique();
            $table->string('woo_category_text', 500);
            $table->string('pcatname', 100)->nullable();
            $table->string('psubcatname', 100)->nullable();
            $table->string('productgroupname', 100)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('woo_category_aliases');
    }
};
