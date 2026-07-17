<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_api_permissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->string('resource', 100);
            $table->boolean('granted')->default(false);

            $table->unique(['role_id', 'resource']);
            $table->index('role_id', 'idx_role_api_permissions_role_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_api_permissions');
    }
};
