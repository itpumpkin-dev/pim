<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('translation_providers', function (Blueprint $table) {
            $table->id();
            $table->string('type', 50);
            $table->string('name', 100);
            $table->text('credentials')->nullable();
            $table->boolean('enabled')->default(true);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        $this->seedFromEnv();
    }

    public function down(): void
    {
        Schema::dropIfExists('translation_providers');
    }

    /**
     * Carries the previously hardcoded LibreTranslate .env config over as
     * the initial default provider, so translation keeps working right
     * after this migration runs without any admin action required.
     */
    private function seedFromEnv(): void
    {
        $url = env('LIBRETRANSLATE_URL', 'https://translate.fedilab.app/translate');
        $apiKey = env('LIBRETRANSLATE_API_KEY');

        DB::table('translation_providers')->insert([
            'type' => 'libretranslate',
            'name' => 'LibreTranslate',
            // Matches the Model's `encrypted:array` cast, which decrypts via
            // decryptString() (no unserialize) then json_decode()s the
            // result — so the plaintext here must be JSON, not serialize().
            'credentials' => Crypt::encryptString(json_encode(array_filter([
                'url' => $url,
                'api_key' => $apiKey,
            ]))),
            'enabled' => true,
            'is_default' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
};
