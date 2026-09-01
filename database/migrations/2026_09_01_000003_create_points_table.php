<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "คะแนน" (Points) master — a small lookup of point types and their
     * ratio/divisor, maintained on /catalog/points. Plain own table (not an
     * AttributeOption like Brands/Base Units) because it carries a numeric
     * `point_ratio`, not just a label.
     */
    public function up(): void
    {
        Schema::create('points', function (Blueprint $table) {
            $table->id();
            $table->string('point_type')->unique();
            $table->decimal('point_ratio', 12, 2)->default(0);
            $table->timestamps();
        });

        $now = now();
        DB::table('points')->insert(collect([
            'z' => 0,
            'ก' => 1800,
            'ข' => 3600,
            'ค' => 7200,
            'ง' => 14400,
            'จ' => 64000,
        ])->map(fn ($ratio, $type) => [
            'point_type' => $type,
            'point_ratio' => $ratio,
            'created_at' => $now,
            'updated_at' => $now,
        ])->values()->all());
    }

    public function down(): void
    {
        Schema::dropIfExists('points');
    }
};
