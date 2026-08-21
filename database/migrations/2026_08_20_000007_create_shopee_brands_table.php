<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // PK is Shopee's own brand_id (not auto-increment) — same shape as
        // shopee_categories. `category_id` is the Shopee category this
        // brand was last seen listed under via get_brand_list — informational
        // only (a brand can legitimately appear under more than one
        // category), not a foreign key.
        Schema::create('shopee_brands', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->unsignedBigInteger('category_id')->nullable();
            $table->timestamps();
        });

        Schema::table('attribute_options', function (Blueprint $table) {
            $table->unsignedBigInteger('shopee_brand_id')->nullable()->after('parent_id');
            $table->foreign('shopee_brand_id')->references('id')->on('shopee_brands')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shopee_brand_id');
        });

        Schema::dropIfExists('shopee_brands');
    }
};
