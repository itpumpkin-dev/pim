<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Jobs\QuickExportProductsJob;
use App\Models\JobTracker;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

/**
 * "ส่งออกด่วน" — เข้าคิวแล้วแจ้งที่กระดิ่ง แทนการสร้างไฟล์ใน request (ไฟล์ทั้งระบบเกิน 60 วินาที)
 */
test('quick export queues a job instead of building the file in the request', function () {
    Queue::fake();
    $user = User::factory()->create();
    $this->actingAs($user);

    $request = Request::create('/catalog/products/quick-export', 'GET', ['format' => 'csv']);
    $request->setUserResolver(fn () => $user);
    $response = app(ProductController::class)->quickExport($request);

    expect($response->getStatusCode())->toBe(302);
    $tracker = JobTracker::where('config_code', 'quick_export')->latest('id')->first();
    expect($tracker->user_id)->toBe($user->id);
    expect($tracker->status)->toBe('queued');
    Queue::assertPushed(QuickExportProductsJob::class, fn ($job) => $job->jobTrackerId === $tracker->id);
});

test('the job writes the file, completes the tracker and notifies the user with a download link', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    Product::create(['sku' => 'QEX-'.uniqid(), 'type' => 'simple', 'enabled' => true]);
    $tracker = JobTracker::create(['job_type' => 'export', 'entity_type' => 'products', 'config_code' => 'quick_export', 'status' => 'queued', 'user_id' => $user->id]);

    app()->call([new QuickExportProductsJob($tracker->id, ['format' => 'csv']), 'handle']);

    $tracker->refresh();
    expect($tracker->status)->toBe('completed');
    expect($tracker->total_rows_processed)->toBeGreaterThan(0);
    Storage::disk('local')->assertExists($tracker->result_file_path);

    $notification = $user->notifications()->latest('id')->first();
    expect($notification->data['url'] ?? null)->toBe("/catalog/products/quick-export/{$tracker->id}/download");
});

test('only the owner can download a quick export file', function () {
    Storage::fake('local');
    $owner = User::factory()->create();
    $other = User::factory()->create();
    Storage::disk('local')->put('exports/x/products.csv', "sku\nA\n");
    $tracker = JobTracker::create(['job_type' => 'export', 'entity_type' => 'products', 'config_code' => 'quick_export', 'status' => 'completed', 'user_id' => $owner->id, 'result_file_path' => 'exports/x/products.csv']);

    $request = Request::create("/catalog/products/quick-export/{$tracker->id}/download");
    $request->setUserResolver(fn () => $other);
    expect(fn () => app(ProductController::class)->downloadQuickExport($request, $tracker))
        ->toThrow(Symfony\Component\HttpKernel\Exception\NotFoundHttpException::class);

    $request->setUserResolver(fn () => $owner);
    expect(app(ProductController::class)->downloadQuickExport($request, $tracker)->getStatusCode())->toBe(200);
});
