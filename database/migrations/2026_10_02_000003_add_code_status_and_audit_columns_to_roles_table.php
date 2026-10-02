<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->string('code', 100)->nullable()->after('id');
            $table->boolean('is_active')->default(true)->after('label');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Existing roles (soft-deleted ones too — the unique index covers
        // them) get the same "role_{n}" shape CodeGenerator suggests for new
        // ones, numbered in creation (id) order.
        $n = 0;
        foreach (DB::table('roles')->orderBy('id')->pluck('id') as $id) {
            DB::table('roles')->where('id', $id)->update(['code' => 'role_' . ++$n]);
        }

        Schema::table('roles', function (Blueprint $table) {
            $table->string('code', 100)->nullable(false)->change();
            $table->unique('code');
        });
    }

    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropConstrainedForeignId('created_by');
            $table->dropConstrainedForeignId('updated_by');
            $table->dropTimestamps();
            $table->dropColumn(['code', 'is_active']);
        });
    }
};
