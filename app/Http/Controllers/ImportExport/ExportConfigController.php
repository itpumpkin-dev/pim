<?php

namespace App\Http\Controllers\ImportExport;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessExportJob;
use App\Models\ExportConfig;
use App\Models\JobTracker;
use App\Services\ImportExport\ImportExportRegistry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ExportConfigController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->input('search');

        $configs = ExportConfig::query()
            ->when($search, fn ($q, $search) => $q->where('code', 'like', "%{$search}%"))
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('import-export/exports/index', [
            'configs' => $configs,
            'filters' => $request->only(['search']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('import-export/exports/create', [
            'types' => ImportExportRegistry::TYPES,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateConfig($request);

        $config = ExportConfig::create([
            ...$validated,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        if ($request->boolean('run')) {
            return $this->dispatchExportJob($request, $config);
        }

        return to_route('importExport.exports.index')->with('success', 'Export configuration saved.');
    }

    public function edit(ExportConfig $exportConfig): Response
    {
        return Inertia::render('import-export/exports/edit', [
            'config' => $exportConfig,
            'types' => ImportExportRegistry::TYPES,
        ]);
    }

    public function update(Request $request, ExportConfig $exportConfig): RedirectResponse
    {
        $validated = $this->validateConfig($request, $exportConfig->id);

        $exportConfig->update([
            ...$validated,
            'updated_by' => $request->user()?->id,
        ]);

        if ($request->boolean('run')) {
            return $this->dispatchExportJob($request, $exportConfig);
        }

        return to_route('importExport.exports.index')->with('success', 'Export configuration saved.');
    }

    public function destroy(ExportConfig $exportConfig): RedirectResponse
    {
        $exportConfig->delete();

        return to_route('importExport.exports.index')->with('success', 'Export configuration deleted.');
    }

    public function run(Request $request, ExportConfig $exportConfig): RedirectResponse
    {
        return $this->dispatchExportJob($request, $exportConfig);
    }

    private function dispatchExportJob(Request $request, ExportConfig $exportConfig): RedirectResponse
    {
        $tracker = JobTracker::create([
            'job_type' => 'export',
            'entity_type' => $exportConfig->type,
            'config_code' => $exportConfig->code,
            'export_config_id' => $exportConfig->id,
            'status' => 'pending',
            'user_id' => $request->user()?->id,
        ]);

        ProcessExportJob::dispatch($tracker->id);

        return to_route('importExport.jobs.show', $tracker->id)->with('success', 'Export job queued.');
    }

    private function validateConfig(Request $request, ?int $configId = null): array
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:export_configs,code'.($configId ? ",{$configId}" : '')],
            'type' => ['required', 'in:'.implode(',', ImportExportRegistry::TYPES)],
            'file_format' => ['required', 'in:csv,xls,xlsx'],
            'field_separator' => ['nullable', 'string', 'max:5'],
            'with_media' => ['boolean'],
        ]);

        $validated['with_media'] = $request->boolean('with_media');

        return $validated;
    }
}
