<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_trackers', function (Blueprint $table) {
            $table->id();
            $table->string('job_type', 10);
            $table->string('entity_type', 50);
            $table->string('config_code', 100);
            $table->foreignId('import_config_id')->nullable()->constrained('import_configs')->nullOnDelete();
            $table->foreignId('export_config_id')->nullable()->constrained('export_configs')->nullOnDelete();
            $table->string('status', 20)->default('pending');
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->unsignedInteger('total_records_created')->default(0);
            $table->unsignedInteger('total_records_skipped')->default(0);
            $table->unsignedInteger('total_rows_processed')->default(0);
            $table->string('result_file_path')->nullable();
            $table->json('error_log')->nullable();
            $table->timestamps();

            $table->index(['job_type', 'status'], 'idx_job_trackers_type_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_trackers');
    }
};
