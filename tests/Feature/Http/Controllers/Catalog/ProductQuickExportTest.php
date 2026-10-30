<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Http\Controllers\ImportExport\JobTrackerController;
use App\Jobs\QuickExportProductsJob;
use App\Models\Attribute;
use App\Models\JobTracker;
use App\Models\Product;
use App\Models\User;
use App\Services\ImportExport\ProductQuickExporter;
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
    expect($tracker->status)->toBe('pending');
    Queue::assertPushed(QuickExportProductsJob::class, fn ($job) => $job->jobTrackerId === $tracker->id);
});

test('the job writes the file, completes the tracker and notifies the user with a download link', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    Product::create(['sku' => 'QEX-'.uniqid(), 'type' => 'simple', 'enabled' => true]);
    $tracker = JobTracker::create(['job_type' => 'export', 'entity_type' => 'products', 'config_code' => 'quick_export', 'status' => 'pending', 'user_id' => $user->id]);

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

test('the exported header row uses column names in the requested locale, not codes', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    Product::create(['sku' => 'QEX-'.uniqid(), 'type' => 'simple', 'enabled' => true]);
    $tracker = JobTracker::create(['job_type' => 'export', 'entity_type' => 'products', 'config_code' => 'quick_export', 'status' => 'pending', 'user_id' => $user->id]);

    app()->call([new QuickExportProductsJob($tracker->id, ['format' => 'csv', 'columns' => ['sku', 'type'], 'locale' => 'th']), 'handle']);

    $header = str_getcsv(strtok(Storage::disk('local')->get($tracker->fresh()->result_file_path), "\n"));
    expect($header)->toBe([__('import.columns.sku', [], 'th'), __('import.columns.type', [], 'th')]);
});

test('cancelling a job still waiting in the queue closes it right away and the job skips when it finally runs', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    $tracker = JobTracker::create(['job_type' => 'export', 'entity_type' => 'products', 'config_code' => 'quick_export', 'status' => 'pending', 'user_id' => $user->id]);

    $this->actingAs($user);
    app(App\Http\Controllers\ImportExport\JobTrackerController::class)->cancel($tracker);
    expect($tracker->fresh()->status)->toBe('cancelled');

    app()->call([new QuickExportProductsJob($tracker->id, ['format' => 'csv']), 'handle']);

    $tracker->refresh();
    expect($tracker->status)->toBe('cancelled');
    expect($tracker->started_at)->toBeNull();
    expect($tracker->result_file_path)->toBeNull();
});

test('cancelling a pending quick export closes it and the job then skips it', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    $this->actingAs($user);
    $tracker = JobTracker::create(['job_type' => 'export', 'entity_type' => 'products', 'config_code' => 'quick_export', 'status' => 'pending', 'user_id' => $user->id]);

    app(JobTrackerController::class)->cancel($tracker);
    expect($tracker->fresh()->status)->toBe('cancelled');

    app()->call([new QuickExportProductsJob($tracker->id, ['format' => 'csv']), 'handle']);
    expect($tracker->fresh()->status)->toBe('cancelled');
    expect($tracker->fresh()->result_file_path)->toBeNull();
});

test('cancelling a quick export that is already processing only requests the cancel', function () {
    $user = User::factory()->create();
    $this->actingAs($user);
    $tracker = JobTracker::create(['job_type' => 'export', 'entity_type' => 'products', 'config_code' => 'quick_export', 'status' => 'processing', 'user_id' => $user->id]);

    app(JobTrackerController::class)->cancel($tracker);

    $tracker->refresh();
    expect($tracker->status)->toBe('processing');
    expect($tracker->cancel_requested_at)->not->toBeNull();
});

test('a quick export stops between chunks once a cancel is requested mid-run', function () {
    Storage::fake('local');
    $user = User::factory()->create();
    Product::create(['sku' => 'QEX-'.uniqid(), 'type' => 'simple', 'enabled' => true]);
    $tracker = JobTracker::create(['job_type' => 'export', 'entity_type' => 'products', 'config_code' => 'quick_export', 'status' => 'pending', 'user_id' => $user->id]);

    // เหมือนผู้ใช้กดยกเลิกระหว่างที่ worker กำลังเขียนชุดแรก
    $exporter = new class extends ProductQuickExporter {
        public function write(?User $user, array $params, string $absolutePath, ?callable $afterChunk = null): int
        {
            return parent::write($user, $params, $absolutePath, function (int $rows) use ($afterChunk) {
                JobTracker::where('config_code', 'quick_export')->update(['cancel_requested_at' => now()]);
                $afterChunk($rows);
            });
        }
    };
    app()->instance(ProductQuickExporter::class, $exporter);

    app()->call([new QuickExportProductsJob($tracker->id, ['format' => 'csv', 'columns' => ['sku']]), 'handle']);

    $tracker->refresh();
    expect($tracker->status)->toBe('cancelled');
    expect($tracker->result_file_path)->toBeNull();
    expect(Storage::disk('local')->allFiles('exports/'.$tracker->id))->toBe([]);
});

test('header names that collide fall back to the raw code so the file re-imports cleanly', function () {
    $exporter = new ProductQuickExporter;
    $method = new ReflectionMethod($exporter, 'headerLabels');
    $attributes = collect([
        'attr_a' => tap((new Attribute)->setRawAttributes(['code' => 'attr_a', 'name' => 'Color'], true), fn ($a) => $a->setRelation('translations', collect())),
        'attr_b' => tap((new Attribute)->setRawAttributes(['code' => 'attr_b', 'name' => 'color '], true), fn ($a) => $a->setRelation('translations', collect())),
        'attr_c' => tap((new Attribute)->setRawAttributes(['code' => 'attr_c', 'name' => 'Size'], true), fn ($a) => $a->setRelation('translations', collect())),
        'attr_d' => tap((new Attribute)->setRawAttributes(['code' => 'attr_d', 'name' => 'attr_c'], true), fn ($a) => $a->setRelation('translations', collect())),
    ]);

    $headers = $method->invoke($exporter, ['sku', 'attr_a', 'attr_b', 'attr_c', 'attr_d'], $attributes, 'en');

    expect($headers)->toBe([__('import.columns.sku', [], 'en'), 'attr_a', 'attr_b', 'Size', 'attr_d']);
});