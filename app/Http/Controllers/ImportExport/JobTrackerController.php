<?php

namespace App\Http\Controllers\ImportExport;

use App\Http\Controllers\Controller;
use App\Models\JobTracker;
use App\Services\Catalog\AttributeAccessPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Inertia\Inertia;
use Inertia\Response;

class JobTrackerController extends Controller
{
    public function __construct(private readonly AttributeAccessPolicy $attributeAccess) {}

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
        $this->assertCanViewJobData($jobTracker);

        $jobTracker->load('user:id,username,first_name,last_name');

        return Inertia::render('import-export/jobs/show', [
            'job' => $jobTracker,
        ]);
    }

    public function status(JobTracker $jobTracker): JsonResponse
    {
        $this->assertCanViewJobData($jobTracker);

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
        $this->assertCanViewJobData($jobTracker);

        abort_unless(
            $jobTracker->job_type === 'export' && $jobTracker->status === 'completed' && $jobTracker->result_file_path,
            404
        );

        return Storage::disk('local')->download($jobTracker->result_file_path);
    }

    /**
     * A job's `entity_type` is the only granularity we have — a 'products'
     * import/export always spans every non-locale/non-channel attribute
     * across every attribute group at once (see ProductRowImporter::columns()),
     * there's no per-job record of which specific groups/attributes it
     * touched. So this can't reuse ProductController's per-group check
     * (canUserViewAttributeGroup) — it can only ask the coarser question
     * "has this role been scoped to specific attribute groups at all", and
     * if so, hide every 'products' job's details rather than guess which
     * ones are actually safe to show.
     */
    private function assertCanViewJobData(JobTracker $jobTracker): void
    {
        $user = auth()->user();

        abort_if(
            $jobTracker->entity_type === 'products' && $user && $this->attributeAccess->hasAnyGroupRestriction($user),
            403,
            'Your role\'s Attribute Access restrictions prevent viewing product import/export job details.'
        );
    }
}
