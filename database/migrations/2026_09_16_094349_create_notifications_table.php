<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Laravel's standard `notifications:table` stub — backs the `database`
 * channel of the `Notifiable` trait (already applied to User, see that
 * model's own `use` list — added earlier for mail notifications, this is
 * the first feature to actually need the `database` channel too). Powers
 * the shell-bar notification bell: NotificationBell.tsx reads
 * $user->notifications, JobResultNotification is what's written into it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
