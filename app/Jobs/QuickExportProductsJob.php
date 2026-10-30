<?php

namespace App\Jobs;

use App\Models\JobTracker;
use App\Services\AppNotifier;
use App\Services\ImportExport\ProductQuickExporter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

/**
 * "ส่งออกด่วน" ของหน้ารายการสินค้า แบบเบื้องหลัง — สร้างไฟล์ แล้วแจ้งที่กระดิ่งพร้อมลิงก์
 * ดาวน์โหลด (ProductController::downloadQuickExport()) แทนที่จะให้ผู้ใช้รอใน request จน
 * เกิน max_execution_time ใช้ JobTracker เก็บสถานะ/ไฟล์ผลลัพธ์ เลยโผล่ในหน้า Job Tracker ด้วย
 */
class QuickExportProductsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 1800;

    /**
     * @param  array<string, mixed>  $params  ค่าที่ validate แล้วจากหน้าต่าง "ส่งออกด่วน"
     */
    public function __construct(public int $jobTrackerId, public array $params)
    {
    }

    public function handle(ProductQuickExporter $exporter): void
    {
        $tracker = JobTracker::with('user')->find($this->jobTrackerId);
        if (! $tracker) {
            return;
        }

        // pending → processing แบบมีเงื่อนไข ไม่ใช่อ่าน status แล้วค่อยเขียน — กันชนกับ
        // JobTrackerController::cancel() ที่ปิดงาน pending เป็น cancelled ในจังหวะเดียวกัน
        // ได้ 0 แถว = ถูกยกเลิกไปตั้งแต่ยังรอคิว ไม่ต้องเริ่มทำ
        $started = JobTracker::where('id', $tracker->id)
            ->where('status', 'pending')
            ->update(['status' => 'processing', 'started_at' => now()]);
        if ($started === 0) {
            return;
        }

        $format = $this->params['format'];
        $relativePath = "exports/{$tracker->id}/products_".now()->format('Ymd_His').".{$format}";
        Storage::disk('local')->makeDirectory(dirname($relativePath));

        // ยกเลิกระหว่างรัน (cancel_requested_at) — เช็คทุกชุด 500 แถวจาก DB ตรงๆ เพราะคำขอยกเลิก
        // มาจากอีก request แล้ว throw ออกมาจาก generator ใน exporter แบบเดียวกับ ProcessExportJob
        $checkCancelled = function (int $rowCount) use ($tracker) {
            $tracker->update(['total_rows_processed' => $rowCount]);
            if (JobTracker::where('id', $tracker->id)->whereNotNull('cancel_requested_at')->exists()) {
                throw new JobCancelledException();
            }
        };

        try {
            $rowCount = $exporter->write($tracker->user, $this->params, Storage::disk('local')->path($relativePath), $checkCancelled);
        } catch (JobCancelledException) {
            Storage::disk('local')->delete($relativePath);
            $tracker->update(['status' => 'cancelled', 'completed_at' => now()]);

            return;
        }

        $tracker->update([
            'status' => 'completed',
            'completed_at' => now(),
            'total_rows_processed' => $rowCount,
            'total_records_created' => $rowCount,
            'result_file_path' => $relativePath,
        ]);

        AppNotifier::notify(
            $tracker->user_id,
            __('Product export is ready'),
            __(':count product(s) exported — click to download.', ['count' => $rowCount]),
            'success',
            "/catalog/products/quick-export/{$tracker->id}/download",
        );
    }

    public function failed(\Throwable $exception): void
    {
        $tracker = JobTracker::find($this->jobTrackerId);
        if (! $tracker) {
            return;
        }

        $tracker->appendError(0, 'Job failed: '.$exception->getMessage());
        $tracker->status = 'failed';
        $tracker->completed_at = now();
        $tracker->save();

        AppNotifier::notify($tracker->user_id, __('Product export failed'), $exception->getMessage(), 'failed', '/catalog/products');
    }
}
