<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AuditLog;
use App\Models\Point;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "คะแนน" (Points) master — CRUD over the `points` table (point_type +
 * point_ratio). Same list / create-page / edit-page shape as the other
 * catalog master screens; `edit_points` covers every write. Every write also
 * mirrors into the `pointtype` attribute's options (see
 * SyncsAttributeOptionMirror), so it drives that dropdown in Edit Product.
 */
class PointController extends Controller
{
    use SyncsAttributeOptionMirror;

    private const MIRROR_ATTRIBUTE = 'pointtype';
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $sortable = ['point_type', 'point_ratio'];
        $sort = in_array($request->input('sort'), $sortable, true) ? $request->input('sort') : 'point_type';
        $dir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $points = Point::query()
            ->when($search !== '', fn ($q) => $q->where('point_type', 'ilike', "%{$search}%"))
            ->orderBy($sort, $dir)
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('catalog/points/index', [
            'points' => $points,
            'filters' => [
                'search' => $search,
                'sort' => $sort,
                'dir' => $dir,
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/points/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validatePayload($request);

        $point = Point::create($validated);

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, $point->point_type, $point->point_type, $point->is_active);

        if ($attribute = $this->auditAttribute()) {
            AuditLog::record('point_created', $attribute, null, $this->auditFields($point));
        }

        return to_route('catalog.points.index')->with('success', 'Point added successfully.');
    }

    public function edit(Point $point): Response
    {
        return Inertia::render('catalog/points/edit', [
            'point' => [
                'id' => $point->id,
                'point_type' => $point->point_type,
                'point_ratio' => $point->point_ratio,
                // $point->start_date is a Carbon instance in PHP even with
                // the model's `date:Y-m-d` cast (that format only kicks in
                // when the *model itself* is serialized, e.g. index()'s
                // paginated list below) — format explicitly here since this
                // builds a plain array instead.
                'start_date' => $point->start_date?->format('Y-m-d'),
                'end_date' => $point->end_date?->format('Y-m-d'),
                'is_active' => $point->is_active,
                'remark' => $point->remark,
            ],
        ]);
    }

    public function update(Request $request, Point $point): RedirectResponse
    {
        $oldCode = $point->point_type;
        $oldFields = $this->auditFields($point);

        $point->update($this->validatePayload($request, $point));

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $oldCode, $point->point_type, $point->point_type, $point->is_active);

        if ($attribute = $this->auditAttribute()) {
            $newFields = $this->auditFields($point->fresh());
            if ($oldFields !== $newFields) {
                AuditLog::record('point_updated', $attribute, $oldFields, $newFields);
            }
        }

        return to_route('catalog.points.index')->with('success', 'Point updated successfully.');
    }

    public function destroy(Point $point): RedirectResponse
    {
        $oldFields = $this->auditFields($point);
        $attribute = $this->auditAttribute();

        $point->delete();

        $this->removeAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $point->point_type);

        if ($attribute) {
            AuditLog::record('point_deleted', $attribute, $oldFields, null);
        }

        return to_route('catalog.points.index')->with('success', 'Point deleted successfully.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Point $point = null): array
    {
        $validated = $request->validate([
            'point_type' => [
                'required',
                'string',
                'max:50',
                Rule::unique('points', 'point_type')->ignore($point?->id),
            ],
            'point_ratio' => ['required', 'numeric', 'min:0', 'max:99999999.99'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'is_active' => ['boolean'],
            'remark' => ['nullable', 'string', 'max:2000'],
        ]);

        $validated['start_date'] = $request->input('start_date') ?: null;
        $validated['end_date'] = $request->input('end_date') ?: null;
        $validated['is_active'] = $request->boolean('is_active', true);
        $validated['remark'] = $request->input('remark');

        return $validated;
    }

    /**
     * The `pointtype` attribute this master mirrors into — see
     * BusinessTypeController::auditAttribute()'s docblock for why events are
     * logged onto it instead of Point (which has no History tab).
     */
    private function auditAttribute(): ?Attribute
    {
        return Attribute::where('code', self::MIRROR_ATTRIBUTE)->first();
    }

    /**
     * Same shape as BrandController::auditFields() — prefixed point#{id}.*
     * snapshot. No translations relation on this model (single point_type
     * column). start_date/end_date formatted to plain strings — see
     * ProductGradeController::auditFields()'s docblock for why that matters.
     */
    private function auditFields(Point $point): array
    {
        $prefix = "point#{$point->id}";

        $fields = collect($point->only(['point_type', 'point_ratio', 'is_active', 'remark']))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
        $fields["{$prefix}.start_date"] = $point->start_date?->format('Y-m-d');
        $fields["{$prefix}.end_date"] = $point->end_date?->format('Y-m-d');

        return $fields;
    }
}
