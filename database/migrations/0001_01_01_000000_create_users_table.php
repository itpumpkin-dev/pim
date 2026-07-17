<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username', 100)->unique();
            $table->string('employee_id', 50)->nullable();
            $table->string('password_hash');
            $table->string('first_name', 100);
            $table->string('last_name', 100);
            $table->string('email');
            $table->boolean('enabled')->default(true);

            $table->foreignId('catalog_locale_id')->nullable()->constrained('locales')->nullOnDelete();
            $table->foreignId('ui_locale_id')->nullable()->constrained('locales')->nullOnDelete();
            $table->foreignId('catalog_scope_id')->nullable()->constrained('channels')->nullOnDelete();
            $table->foreignId('default_tree_id')->nullable()->constrained('categories')->nullOnDelete();

            $table->index('catalog_locale_id', 'idx_users_catalog_locale_id');
            $table->index('ui_locale_id', 'idx_users_ui_locale_id');
            $table->index('catalog_scope_id', 'idx_users_catalog_scope_id');
            $table->index('default_tree_id', 'idx_users_default_tree_id');

            $table->string('timezone', 50)->default('UTC');
            $table->timestampTz('last_login_at')->nullable();
            $table->integer('login_count')->default(0);

            // Not part of the source schema, kept so Laravel's built-in "remember me"
            // and e-mail verification features keep working unmodified.
            $table->timestamp('email_verified_at')->nullable();
            $table->rememberToken();

            $table->timestamps();
        });

        DB::statement('CREATE UNIQUE INDEX idx_users_employee_id ON users (employee_id) WHERE employee_id IS NOT NULL');

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};
