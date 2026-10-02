<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_groups', function (Blueprint $table) {
            $table->string('code', 100)->nullable()->after('id');
            $table->boolean('is_active')->default(true)->after('description');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Existing groups get the same "group_{n}" shape CodeGenerator hands
        // out for new ones, numbered in creation (id) order.
        $n = 0;
        foreach (DB::table('user_groups')->orderBy('id')->pluck('id') as $id) {
            DB::table('user_groups')->where('id', $id)->update(['code' => 'group_' . ++$n]);
        }

        Schema::table('user_groups', function (Blueprint $table) {
            $table->string('code', 100)->nullable(false)->change();
            $table->unique('code');
        });
    }

    public function down(): void
    {
        Schema::table('user_groups', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropConstrainedForeignId('created_by');
            $table->dropConstrainedForeignId('updated_by');
            $table->dropTimestamps();
            $table->dropColumn(['code', 'is_active']);
        });
    }
};
