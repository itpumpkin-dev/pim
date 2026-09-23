<?php

namespace App\Http\Controllers\ImportExport;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessImportJob;
use App\Models\AttributeFamily;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\ImportConfig;
use App\Models\JobTracker;
use App\Models\Locale;
use App\Services\CodeGenerator;
use App\Services\ImportExport\ImportExportRegistry;
use App\Services\ImportExport\SampleTemplateBuilder;
use App\Services\ImportExport\SpreadsheetWriter;
use Illuminate\Http\JsonResponse;
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
            ->when($search, fn ($q, $search) => $q->where('code', 'ilike', "%{$search}%"))
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('import-export/imports/index', [
            'configs' => $configs,
            'filters' => $request->only(['search']),
        ]);
    }

    /**
     * Import types held back from the create wizard — none anymore. Master
     * data types (categories/attributes/attribute_families/attribute_options)
     * were gated off here while the wizard only supported products; the
     * Master/Product split in imports/create.tsx now covers them properly
     * (edit() already exposed the full, unrestricted type list, so an
     * existing master-data import config could always be edited — only
     * *creating* a new one was blocked).
     */
    private const CREATE_DISABLED_TYPES = [];

    public function create(): Response
    {
        return Inertia::render('import-export/imports/create', [
            'types' => collect(ImportExportRegistry::TYPES)
                ->reject(fn (string $type) => in_array($type, self::CREATE_DISABLED_TYPES, true))
                ->values(),
            'requiredColumnsByType' => $this->requiredColumnsByType(),
            'columnLabelsByType' => $this->columnLabelsByType(),
        ]);
    }

    /**
     * Column schema for one import type, resolved for the current user and
     * (products only) the Attribute Family/Families resolved for the wizard's
     * chosen Category/Subcategory/Product Group — powers the wizard's
     * "review" step: which columns exist, which are required, their labels,
     * and a one-row sample preview. Kept as a plain JSON endpoint so the
     * wizard can refetch it when the selection changes without a full reload.
     *
     * $family may hold several comma-separated Attribute Family codes (the
     * union of every family bound to the selected Product Group — see
     * categoryAttributeFamilies() below) — ProductRowImporter resolves the
     * union of their attributes, same as it always did for a single code.
     */
    public function schema(Request $request, string $type): JsonResponse
    {
        abort_unless(in_array($type, ImportExportRegistry::TYPES, true), 404);

        $family = $type === 'products' ? $request->string('family')->toString() : '';
        $family = $family !== '' ? $family : null;

        $importer = ImportExportRegistry::importer($type, $request->user(), null, $family);
        $sample = SampleTemplateBuilder::build($type, $request->user(), $family);

        return response()->json([
            'columns' => $importer->columns(),
            'required' => $importer->requiredColumns(),
            'labels' => $importer->columnLabels(),
            'sample' => $sample,
        ]);
    }

    /**
     * Nested Category/Subcategory/Product Group tree for the product-import
     * wizard's "family" step — same cached payload CategoryController::tree()
     * serves to CategoryCascadeSelect (see Category::treeArray()), just
     * exposed under an import_configs-gated route so import-only roles
     * (without the separate `categories` permission) can still use it.
     */
    public function categoryTree(): JsonResponse
    {
        return response()->json(Category::treeArray());
    }

    /**
     * Attribute Family/Families bound to one Product Group (a leaf Category)
     * via `category_attribute_family` — resolves what the wizard's "family"
     * step shows once the user finishes drilling down the cascade, ordered
     * the same way Category::attributeFamilies() always has (sort_order).
     */
    public function categoryAttributeFamilies(Category $category): JsonResponse
    {
        return response()->json(
            $category->attributeFamilies()
                ->get(['attribute_families.code', 'attribute_families.name'])
                ->map(fn (AttributeFamily $family) => ['code' => $family->code, 'name' => $family->name])
                ->values()
        );
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

        // งาน import แก้ข้อมูลจำนวนมากแบบ bulk (บางส่วนผ่าน upsert ที่ไม่ยิง
        // model event) เลยบันทึกไว้ที่นี่ว่าใครสั่งรัน config ไหน ด้วยไฟล์อะไร
        AuditLog::record('import_run', $importConfig, null, [
            'job_tracker_id' => $tracker->id,
            'type' => $importConfig->type,
            'source_file_path' => $importConfig->source_file_path,
        ]);

        return to_route('importExport.jobs.show', $tracker->id)->with('success', 'Import job queued.');
    }

    public function sample(Request $request, string $type): BinaryFileResponse
    {
        abort_unless(in_array($type, ImportExportRegistry::TYPES, true), 404);

        $validated = $request->validate([
            'format' => ['nullable', Rule::in(['csv', 'xlsx'])],
            'family' => ['nullable', 'string'],
        ]);
        $format = $validated['format'] ?? 'csv';
        $family = $type === 'products' ? ($validated['family'] ?? null) : null;

        $table = SampleTemplateBuilder::build($type, auth()->user(), $family);

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
            // Comma-separated list of Attribute Family codes (the wizard's
            // category picker may resolve more than one family for a single
            // Product Group) — Rule::exists() only checks a single scalar,
            // so each code is validated individually here instead.
            'family_code' => ['nullable', 'string', function (string $attribute, mixed $value, \Closure $fail) {
                $codes = array_values(array_filter(array_map('trim', explode(',', (string) $value))));
                if ($codes === []) {
                    return;
                }
                $missing = array_diff($codes, AttributeFamily::whereIn('code', $codes)->pluck('code')->all());
                if ($missing !== []) {
                    $fail("The {$attribute} contains unknown Attribute Family code(s): ".implode(', ', $missing));
                }
            }],
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
