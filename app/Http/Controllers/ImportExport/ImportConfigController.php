<?php

namespace App\Http\Controllers\ImportExport;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessImportJob;
use App\Models\ImportConfig;
use App\Models\JobTracker;
use App\Models\Locale;
use App\Services\CodeGenerator;
use App\Services\ImportExport\ImportExportRegistry;
use App\Services\ImportExport\SampleTemplateBuilder;
use App\Services\ImportExport\SpreadsheetWriter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ImportConfigController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->input('search');

        $configs = ImportConfig::query()
            ->when($search, fn ($q, $search) => $q->where('code', 'like', "%{$search}%"))
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('import-export/imports/index', [
            'configs' => $configs,
            'filters' => $request->only(['search']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('import-export/imports/create', [
            'types' => ImportExportRegistry::TYPES,
            'requiredColumnsByType' => $this->requiredColumnsByType(),
            'columnLabelsByType' => $this->columnLabelsByType(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateConfig($request);

        $config = CodeGenerator::createWithRetry('import_configs', $validated['type'], fn ($code) => ImportConfig::create([
            ...collect($validated)->except('file')->all(),
            'code' => $code,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]));

        $this->storeUploadedFile($request, $config);

        if ($request->boolean('run')) {
            return $this->dispatchImportJob($request, $config->fresh());
        }

        return to_route('importExport.imports.index')->with('success', 'Import configuration saved.');
    }

    public function edit(ImportConfig $importConfig): Response
    {
        return Inertia::render('import-export/imports/edit', [
            'config' => $importConfig,
            'types' => ImportExportRegistry::TYPES,
            'requiredColumnsByType' => $this->requiredColumnsByType(),
            'columnLabelsByType' => $this->columnLabelsByType(),
        ]);
    }

    public function update(Request $request, ImportConfig $importConfig): RedirectResponse
    {
        $validated = $this->validateConfig($request);

        $importConfig->update([
            ...collect($validated)->except('file')->all(),
            'updated_by' => $request->user()?->id,
        ]);

        $this->storeUploadedFile($request, $importConfig);

        if ($request->boolean('run')) {
            return $this->dispatchImportJob($request, $importConfig->fresh());
        }

        return to_route('importExport.imports.index')->with('success', 'Import configuration saved.');
    }

    public function destroy(ImportConfig $importConfig): RedirectResponse
    {
        if ($importConfig->source_file_path) {
            Storage::disk('local')->delete($importConfig->source_file_path);
        }
        $importConfig->delete();

        return to_route('importExport.imports.index')->with('success', 'Import configuration deleted.');
    }

    public function run(Request $request, ImportConfig $importConfig): RedirectResponse
    {
        return $this->dispatchImportJob($request, $importConfig);
    }

    private function dispatchImportJob(Request $request, ImportConfig $importConfig): RedirectResponse
    {
        if (!$importConfig->source_file_path) {
            return back()->withErrors(['file' => 'Upload a file before running the import.']);
        }

        $tracker = JobTracker::create([
            'job_type' => 'import',
            'entity_type' => $importConfig->type,
            'config_code' => $importConfig->code,
            'import_config_id' => $importConfig->id,
            'status' => 'pending',
            'user_id' => $request->user()?->id,
        ]);

        ProcessImportJob::dispatch($tracker->id);

        return to_route('importExport.jobs.show', $tracker->id)->with('success', 'Import job queued.');
    }

    public function sample(Request $request, string $type): BinaryFileResponse
    {
        abort_unless(in_array($type, ImportExportRegistry::TYPES, true), 404);

        $validated = $request->validate([
            'format' => ['nullable', Rule::in(['csv', 'xlsx'])],
        ]);
        $format = $validated['format'] ?? 'csv';

        $table = SampleTemplateBuilder::build($type, auth()->user());

        $tempPath = sys_get_temp_dir().'/import_sample_'.Str::uuid().'.'.$format;
        SpreadsheetWriter::write($tempPath, $format, $table['columns'], $table['rows']);

        return response()->download($tempPath, "{$type}_sample.{$format}")->deleteFileAfterSend(true);
    }

    /**
     * @return array<string, array<int, string>>
     */
    private function requiredColumnsByType(): array
    {
        return collect(ImportExportRegistry::TYPES)
            ->mapWithKeys(fn (string $type) => [$type => ImportExportRegistry::importer($type)->requiredColumns()])
            ->all();
    }

    /**
     * code => localized label, per type — lets the "Required fields" chips
     * show e.g. "Product Name" instead of the raw `pname` code.
     *
     * @return array<string, array<string, string>>
     */
    private function columnLabelsByType(): array
    {
        return collect(ImportExportRegistry::TYPES)
            ->mapWithKeys(fn (string $type) => [$type => ImportExportRegistry::importer($type)->columnLabels()])
            ->all();
    }

    private function validateConfig(Request $request): array
    {
        return $request->validate([
            'type' => ['required', 'in:'.implode(',', ImportExportRegistry::TYPES)],
            'file_format' => ['required', 'in:csv,xls,xlsx'],
            'field_separator' => ['nullable', 'string', 'max:5'],
            'action' => ['required', 'in:create_update,delete'],
            'validation_strategy' => ['required', 'in:skip_errors,stop_on_errors'],
            'ai_translate' => ['nullable', 'boolean'],
            'source_locale' => ['required', 'string', Rule::in(Locale::active()->pluck('code')->all())],
            'allowed_errors' => ['required', 'integer', 'min:0'],
            'image_directory_path' => ['nullable', 'string', 'max:255'],
            'file' => ['nullable', 'file', 'max:20480'],
        ]);
    }

    private function storeUploadedFile(Request $request, ImportConfig $config): void
    {
        if (!$request->hasFile('file')) {
            return;
        }

        if ($config->source_file_path) {
            Storage::disk('local')->delete($config->source_file_path);
        }

        $file = $request->file('file');
        $path = $file->store("imports/{$config->id}", 'local');
        $config->update([
            'source_file_path' => $path,
            'source_file_name' => $file->getClientOriginalName(),
        ]);
    }
}
