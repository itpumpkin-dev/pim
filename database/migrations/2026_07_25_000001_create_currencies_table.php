<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('currencies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 10)->unique();
            $table->string('name', 100)->nullable();
        });

        $currencies = [
            ['code' => 'THB', 'name' => 'Thai Baht'],
            ['code' => 'USD', 'name' => 'US Dollar'],
            ['code' => 'EUR', 'name' => 'Euro'],
            ['code' => 'SGD', 'name' => 'Singapore Dollar'],
            ['code' => 'JPY', 'name' => 'Japanese Yen'],
            ['code' => 'CNY', 'name' => 'Chinese Yuan'],
            ['code' => 'GBP', 'name' => 'British Pound'],
            ['code' => 'AUD', 'name' => 'Australian Dollar'],
            ['code' => 'HKD', 'name' => 'Hong Kong Dollar'],
            ['code' => 'MYR', 'name' => 'Malaysian Ringgit'],
            ['code' => 'IDR', 'name' => 'Indonesian Rupiah'],
            ['code' => 'VND', 'name' => 'Vietnamese Dong'],
        ];

        DB::table('currencies')->insert($currencies);
    }

    public function down(): void
    {
        Schema::dropIfExists('currencies');
    }
};
