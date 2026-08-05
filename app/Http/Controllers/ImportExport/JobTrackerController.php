<?php

namespace App\Http\Controllers\ImportExport;

use App\Http\Controllers\Controller;
use App\Models\JobTracker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Inertia\Inertia;
use Inertia\Response;

class JobTrackerController extends Controller
{
    public function index(Request $request): Response
    {
        $status = $request->input('status');
        $jobType = $request->input('job_type');

        $jobs = JobTracker::with('user:id,username,first_name,last_name')
            ->when($status, fn ($q, $status) => $q->where('status', $status))
            ->when($jobType, fn ($q, $jobType) => $q->where('job_type', $jobType))
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('import-export/jobs/index', [
            'jobs' => $jobs,
            'filters' => $request->only(['status', 'job_type']),
        ]);
    }

    public function show(JobTracker $jobTracker): Response
    {
        $jobTracker->load('user:id,username,first_name,last_name');

        return Inertia::render('import-export/jobs/show', [
            'job' => $jobTracker,
        ]);
    }

    public function status(JobTracker $jobTracker): JsonResponse
    {
        return response()->json([
            'status' => $jobTracker->status,
            'total_records_created' => $jobTracker->total_records_created,
            'total_records_skipped' => $jobTracker->total_records_skipped,
            'total_rows_processed' => $jobTracker->total_rows_processed,
            // ISO 8601 with an explicit UTC offset, matching how the model
            // cast itself would serialize it on the initial page load —
            // toDateTimeString() strips the offset, so once a poll response
            // lands it would overwrite a correct value with an ambiguous one.
            'completed_at' => $jobTracker->completed_at?->toIso8601String(),
            'error_log' => $jobTracker->error_log,
        ]);
    }

    public function download(JobTracker $jobTracker): StreamedResponse
    {
        abort_unless(
            $jobTracker->job_type === 'export' && $jobTracker->status === 'completed' && $jobTracker->result_file_path,
            404
        );

        return Storage::disk('local')->download($jobTracker->result_file_path);
    }
}
