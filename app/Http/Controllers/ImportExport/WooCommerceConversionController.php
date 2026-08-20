<?php

namespace App\Http\Controllers\ImportExport;

use App\Http\Controllers\Controller;
use App\Models\AttributeFamily;
use App\Models\Locale;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\WooConversion;
use App\Services\ImportExport\SpreadsheetWriter;
use App\Services\ImportExport\WooCommerceConverter;
use App\Services\ImportExport\WooCommerceExporter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
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
        // 38MB, not 40MB: php.ini's upload_max_filesize/post_max_size are
        // 40M (see C:\xampp\php\php.ini) — this must stay under that hard
        // ceiling (with headroom for multipart overhead) or a file between
        // 38-40MB fails to even reach this validator, producing an empty
        // $_FILES and a confusing "file required" error instead of a clear
        // size-limit message. Real WooCommerce catalog exports (e.g. a
        // ~2,600-product/33MB export) routinely exceed the previous 20MB cap.
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:38912'],
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

    /**
     * The reverse direction: exports PIM products into WooCommerce's own
     * Products > Import CSV column shape, for a single chosen locale — see
     * WooCommerceExporter's docblock for the mapping and its one Thai-source
     * fallback exception.
     *
     * 'shops' lists the 'woocommerce' SalesPlatform's shops (see the
     * 2026_08_19_000003 migration, which seeds that platform so it appears
     * on the Sales Platforms page like Lazada/Shopee/TikTok) — picking one
     * on the export form scopes channel-based values to that store, same as
     * those three marketplaces' own sync. It's read-only here: if the
     * platform hasn't been seeded yet (fresh install pre-migration) this is
     * just an empty list and the export form falls back to un-scoped values,
     * same as before.
     */
    public function exportForm(): Response
    {
        $wooPlatform = SalesPlatform::where('code', 'woocommerce')->first();

        return Inertia::render('import-export/woo-convert/export', [
            'locales' => Locale::active()->map(fn ($locale) => [
                'code' => $locale->code,
                'display_name' => $locale->display_name,
            ])->values(),
            'families' => AttributeFamily::query()->orderBy('code')->get(['code', 'name']),
            'shops' => $wooPlatform
                ? $wooPlatform->shops()->orderBy('name')->get(['id', 'code', 'name', 'is_active'])
                : [],
        ]);
    }

    /**
     * Synchronous, direct-download export — same reasoning as
     * ProductController::quickExport(): generating the file takes seconds
     * even for the whole catalog, so there's nothing a queued job/history
     * record would add here that a plain GET download doesn't already give.
     */
    public function export(Request $request): BinaryFileResponse
    {
        $validated = $request->validate([
            'locale' => ['required', 'string', Rule::in(Locale::active()->pluck('code'))],
            'format' => ['required', 'in:csv,xlsx'],
            'family_code' => ['nullable', 'string'],
            'enabled_only' => ['nullable', 'boolean'],
            'product_ids' => ['nullable', 'array'],
            'product_ids.*' => ['integer', 'exists:products,id'],
            'shop_id' => ['nullable', 'integer', 'exists:sales_platform_shops,id'],
        ]);

        $query = Product::whereNull('parent_id');
        if (! empty($validated['product_ids'])) {
            // A specific hand-picked selection overrides the family/enabled
            // filters below rather than combining with them — picking exact
            // products is a deliberate override of "export everything
            // matching X", not a further narrowing of it.
            $query->whereIn('id', $validated['product_ids']);
        } else {
            if (! empty($validated['family_code'])) {
                $query->whereHas('family', fn ($q) => $q->where('code', $validated['family_code']));
            }
            if ($request->boolean('enabled_only')) {
                $query->where('enabled', true);
            }
        }
        $products = $query->orderBy('sku')->get(['id', 'sku', 'family_id', 'type', 'enabled', 'configurable_attributes']);

        $shop = ! empty($validated['shop_id']) ? SalesPlatformShop::find($validated['shop_id']) : null;

        $result = (new WooCommerceExporter())->export($products, $validated['locale'], $shop?->channel_id);

        $format = $validated['format'];
        $tempPath = sys_get_temp_dir().'/woo_export_'.Str::uuid().'.'.$format;
        SpreadsheetWriter::write($tempPath, $format, $result['header'], $result['rows'], ',');

        $downloadName = "woocommerce-export-{$validated['locale']}-".now()->format('Ymd_His').".{$format}";

        return response()->download($tempPath, $downloadName)->deleteFileAfterSend(true);
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
