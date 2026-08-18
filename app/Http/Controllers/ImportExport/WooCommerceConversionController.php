<?php

namespace App\Http\Controllers\ImportExport;

use App\Http\Controllers\Controller;
use App\Models\AttributeFamily;
use App\Models\WooConversion;
use App\Services\ImportExport\WooCommerceConverter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Reader\Csv as CsvReader;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Converts a WooCommerce product-export CSV into the CSV shape
 * ProductRowImporter expects (see that class for the authoritative list of
 * supported columns), so the result can be fed into the real import flow at
 * imports/create. Each run is kept as a WooConversion row + its files under
 * storage/app/woo-conversions/{id}/ so past conversions stay visible as
 * history (see index()), the same way import/export runs stay visible via
 * JobTracker.
 */
class WooCommerceConversionController extends Controller
{
    private const DISK = 'local';

    private const BASE_PATH = 'woo-conversions';

    public function index(): Response
    {
        $conversions = WooConversion::with('creator:id,username,first_name,last_name')
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('import-export/woo-convert/index', [
            'conversions' => $conversions,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('import-export/woo-convert/create', [
            'families' => AttributeFamily::query()->orderBy('code')->get(['code', 'name']),
        ]);
    }

    public function convert(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:20480'],
            'category_map' => ['nullable', 'file', 'max:2048'],
            'family_code' => ['nullable', 'string', 'max:100'],
        ]);

        if (strtolower((string) $request->file('file')->getClientOriginalExtension()) !== 'csv') {
            return back()->withErrors(['file' => 'Only .csv files are supported.']);
        }
        if ($request->hasFile('category_map')
            && strtolower((string) $request->file('category_map')->getClientOriginalExtension()) !== 'csv') {
            return back()->withErrors(['category_map' => 'Only .csv files are supported.']);
        }

        $categoryMapPath = $request->hasFile('category_map')
            ? $request->file('category_map')->getRealPath()
            : null;

        $converter = new WooCommerceConverter();
        $result = $converter->convert($request->file('file')->getRealPath(), [
            'family_code' => (string) ($validated['family_code'] ?? ''),
            'emit_name' => $request->boolean('emit_name', true),
            'emit_description' => $request->boolean('emit_description', true),
            'strip_html' => $request->boolean('strip_html', true),
            'category_map_path' => $categoryMapPath,
        ]);

        $conversion = WooConversion::create([
            ...$result['summary'],
            'original_filename' => $request->file('file')->getClientOriginalName(),
            'has_unmatched' => $result['unmatchedCsv'] !== null,
            'converted_file_path' => '', // filled in below once we know the id
            'created_by' => $request->user()?->id,
        ]);

        $dir = self::BASE_PATH . "/{$conversion->id}";
        $convertedPath = "{$dir}/converted.csv";
        Storage::disk(self::DISK)->put($convertedPath, $result['csv']);

        $unmatchedPath = null;
        if ($result['unmatchedCsv'] !== null) {
            $unmatchedPath = "{$dir}/unmatched-categories.csv";
            Storage::disk(self::DISK)->put($unmatchedPath, $result['unmatchedCsv']);
        }

        $conversion->update([
            'converted_file_path' => $convertedPath,
            'unmatched_file_path' => $unmatchedPath,
        ]);

        return to_route('importExport.wooConvert.show', $conversion->id)->with('success', 'Conversion complete.');
    }

    public function show(WooConversion $wooConversion): Response
    {
        $wooConversion->load('creator:id,username,first_name,last_name');

        return Inertia::render('import-export/woo-convert/show', [
            'conversion' => $wooConversion,
        ]);
    }

    public function download(WooConversion $wooConversion): StreamedResponse
    {
        abort_unless(Storage::disk(self::DISK)->exists($wooConversion->converted_file_path), 404);

        return Storage::disk(self::DISK)->download($wooConversion->converted_file_path, 'converted-products.csv');
    }

    public function downloadUnmatched(WooConversion $wooConversion): StreamedResponse
    {
        abort_unless(
            $wooConversion->unmatched_file_path && Storage::disk(self::DISK)->exists($wooConversion->unmatched_file_path),
            404
        );

        return Storage::disk(self::DISK)->download($wooConversion->unmatched_file_path, 'unmatched-categories.csv');
    }

    /**
     * The stored file is always the canonical CSV (also the shape
     * ProductRowImporter's own CSV path expects); this converts it to XLSX
     * on demand rather than storing both formats for every conversion.
     */
    public function downloadXlsx(WooConversion $wooConversion): BinaryFileResponse
    {
        abort_unless(Storage::disk(self::DISK)->exists($wooConversion->converted_file_path), 404);

        $reader = new CsvReader();
        $reader->setInputEncoding('UTF-8');
        $reader->setDelimiter(',');
        $spreadsheet = $reader->load(Storage::disk(self::DISK)->path($wooConversion->converted_file_path));

        $tempPath = sys_get_temp_dir() . '/woo_xlsx_' . Str::uuid() . '.xlsx';
        IOFactory::createWriter($spreadsheet, 'Xlsx')->save($tempPath);

        return response()->download($tempPath, 'converted-products.xlsx')->deleteFileAfterSend(true);
    }
}
