<?php

use App\Models\JobTracker;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * ตัด error_log ของงานเก่าที่ยาวเกิน JobTracker::MAX_LOG_ENTRIES (เช่น import
 * ที่ทุกแถวมี warning — เคยเห็นถึง 17k+ รายการ) ให้เหลือ MAX รายการแรก +
 * entry สรุปตัวเดียว แบบเดียวกับที่งานใหม่เก็บ (JobTracker::capLog()) — ไม่งั้น
 * หน้า Job Tracker ของงานพวกนี้ยังต้องโหลด/แสดง log ก้อนใหญ่อยู่ดี
 *
 * ไม่มี down(): รายการที่ตัดทิ้งไปกู้คืนไม่ได้ (ส่วนใหญ่เป็นข้อความเดิมซ้ำๆ
 * ต่อแถว และจำนวนที่ตัดถูกนับไว้ใน entry สรุปแล้ว)
 */
return new class extends Migration
{
    public function up(): void
    {
        $ids = DB::table('job_trackers')
            ->whereNotNull('error_log')
            ->whereRaw('json_array_length(error_log) > ?', [JobTracker::MAX_LOG_ENTRIES])
            ->pluck('id');

        foreach ($ids as $id) {
            $log = json_decode((string) DB::table('job_trackers')->where('id', $id)->value('error_log'), true);
            if (! is_array($log)) {
                continue;
            }

            DB::table('job_trackers')->where('id', $id)->update([
                'error_log' => json_encode(JobTracker::capLog($log), JSON_UNESCAPED_UNICODE),
            ]);
        }
    }

    public function down(): void
    {
        //
    }
};
