<?php

use App\Models\JobTracker;

/**
 * error_log เก็บแค่ MAX_LOG_ENTRIES รายการแรก ที่เกินนับรวมไว้ใน entry สรุปตัวเดียว
 * (ไม่ต้องใช้ DB — appendWarning/appendError แค่แก้ attribute ในหน่วยความจำ)
 */
test('error_log keeps the first MAX_LOG_ENTRIES entries plus one running summary of the rest', function () {
    $tracker = new JobTracker();
    $max = JobTracker::MAX_LOG_ENTRIES;

    for ($i = 1; $i <= $max + 30; $i++) {
        $tracker->appendWarning($i, "warning {$i}");
    }
    $tracker->appendError($max + 31, 'boom');
    $tracker->appendError($max + 32, 'boom');

    $log = $tracker->error_log;
    expect($log)->toHaveCount($max + 1);
    expect($log[$max - 1]['message'])->toBe("warning {$max}");

    $summary = end($log);
    expect($summary['row'])->toBe(0);
    expect($summary['omitted_warnings'])->toBe(30);
    expect($summary['omitted_errors'])->toBe(2);
    expect($summary['level'])->toBe('error');
});

test('error_log below the cap is unchanged', function () {
    $tracker = new JobTracker();
    $tracker->appendError(2, 'sku is required');

    expect($tracker->error_log)->toBe([['row' => 2, 'message' => 'sku is required', 'level' => 'error']]);
});

test('a log that was already over the cap (from before the cap existed) is trimmed and counted on the next append', function () {
    $tracker = new JobTracker();
    $max = JobTracker::MAX_LOG_ENTRIES;
    $tracker->error_log = array_map(fn ($i) => ['row' => $i, 'message' => "w{$i}", 'level' => 'warning'], range(1, $max + 100));

    $tracker->appendError($max + 101, 'boom');

    $log = $tracker->error_log;
    expect($log)->toHaveCount($max + 1);
    expect($log[$max - 1]['message'])->toBe("w{$max}");
    expect(end($log)['omitted_warnings'])->toBe(100);
    expect(end($log)['omitted_errors'])->toBe(1);
});

test('job-level messages (row 0) are kept even after the log is full', function () {
    $tracker = new JobTracker();
    for ($i = 1; $i <= JobTracker::MAX_LOG_ENTRIES + 5; $i++) {
        $tracker->appendWarning($i, "w{$i}");
    }
    $tracker->appendError(0, 'Job failed: boom');

    $log = $tracker->error_log;
    expect(array_column($log, 'message'))->toContain('Job failed: boom');
    $summary = end($log);
    expect($summary['omitted_warnings'])->toBe(5);
    expect($summary['omitted_errors'])->toBe(0);
});
