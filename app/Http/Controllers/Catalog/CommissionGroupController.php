<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AuditLog;
use App\Models\CommissionGroup;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "กลุ่มคอมมิชชั่น" (Commission Groups) master — CRUD over the
 * `commission_groups` table (code / p_group_name / two commission-rate
 * divisors / status / remark). Same list / create-page / edit-page shape as
 * the other catalog master screens; `edit_commission_groups` covers every
 * write. Every write also mirrors into the `commission_group` attribute's
 * options (see SyncsAttributeOptionMirror), so it drives that dropdown in
 * Edit Product.
 */
class CommissionGroupController extends Controller
{
    use SyncsAttributeOptionMirror;

    private const MIRROR_ATTRIBUTE = 'commission_group';
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $sortable = ['code', 'p_group_name', 'divisor_start', 'divisor_secondary', 'is_active'];
        $sort = in_array($request->input('sort'), $sortable, true) ? $request->input('sort') : 'code';
        $dir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $groups = CommissionGroup::query()
            ->when($search !== '', function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")->orWhere('p_group_name', 'like', "%{$search}%");
            })
            ->orderBy($sort, $dir)
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('catalog/commission-groups/index', [
            'commissionGroups' => $groups,
            'filters' => [
                'search' => $search,
                'sort' => $sort,
                'dir' => $dir,
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/commission-groups/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $group = CommissionGroup::create($this->validatePayload($request));

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, $group->code, $group->p_group_name ?? $group->code, $group->is_active);

        if ($attribute = $this->auditAttribute()) {
            AuditLog::record('commission_group_created', $attribute, null, $this->auditFields($group));
        }

        return to_route('catalog.commissionGroups.index')->with('success', 'Commission group added successfully.');
    }

    public function edit(CommissionGroup $commissionGroup): Response
    {
        return Inertia::render('catalog/commission-groups/edit', [
            'commissionGroup' => [
                'id' => $commissionGroup->id,
                'code' => $commissionGroup->code,
                'p_group_name' => $commissionGroup->p_group_name,
                'divisor_start' => $commissionGroup->divisor_start,
                'divisor_secondary' => $commissionGroup->divisor_secondary,
                // Carbon instances even with the model's `date:Y-m-d` cast —
                // that format only kicks in when the model itself is
                // serialized (index()'s paginated list); this builds a plain
                // array instead, so format explicitly.
                'start_date' => $commissionGroup->start_date?->format('Y-m-d'),
                'end_date' => $commissionGroup->end_date?->format('Y-m-d'),
                'is_active' => $commissionGroup->is_active,
                'remark' => $commissionGroup->remark,
            ],
        ]);
    }

    public function update(Request $request, CommissionGroup $commissionGroup): RedirectResponse
    {
        $oldCode = $commissionGroup->code;
        $oldFields = $this->auditFields($commissionGroup);

        $commissionGroup->update($this->validatePayload($request, $commissionGroup));

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $oldCode, $commissionGroup->code, $commissionGroup->p_group_name ?? $commissionGroup->code, $commissionGroup->is_active);

        if ($attribute = $this->auditAttribute()) {
            $newFields = $this->auditFields($commissionGroup->fresh());
            if ($oldFields !== $newFields) {
                AuditLog::record('commission_group_updated', $attribute, $oldFields, $newFields);
            }
        }

        return to_route('catalog.commissionGroups.index')->with('success', 'Commission group updated successfully.');
    }

    public function destroy(CommissionGroup $commissionGroup): RedirectResponse
    {
        $oldFields = $this->auditFields($commissionGroup);
        $attribute = $this->auditAttribute();

        $commissionGroup->delete();

        $this->removeAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $commissionGroup->code);

        if ($attribute) {
            AuditLog::record('commission_group_deleted', $attribute, $oldFields, null);
        }

        return to_route('catalog.commissionGroups.index')->with('success', 'Commission group deleted successfully.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?CommissionGroup $commissionGroup = null): array
    {
        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:50',
                Rule::unique('commission_groups', 'code')->ignore($commissionGroup?->id),
            ],
            'p_group_name' => ['nullable', 'string', 'max:255'],
            'divisor_start' => ['required', 'numeric', 'min:0', 'max:999999.99'],
            'divisor_secondary' => ['required', 'numeric', 'min:0', 'max:999999.99'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'is_active' => ['boolean'],
            'remark' => ['nullable', 'string', 'max:2000'],
        ]);

        $validated['p_group_name'] = $request->input('p_group_name');
        $validated['start_date'] = $request->input('start_date') ?: null;
        $validated['end_date'] = $request->input('end_date') ?: null;
        $validated['remark'] = $request->input('remark');
        $validated['is_active'] = $request->boolean('is_active', true);

        return $validated;
    }

    /**
     * The `commission_group` attribute this master mirrors into — see
     * BusinessTypeController::auditAttribute()'s docblock for why events are
     * logged onto it instead of CommissionGroup (which has no History tab).
     */
    private function auditAttribute(): ?Attribute
    {
        return Attribute::where('code', self::MIRROR_ATTRIBUTE)->first();
    }

    /**
     * Same shape as BrandController::auditFields() — prefixed
     * commission_group#{id}.* snapshot. No translations relation on this
     * model (single p_group_name column, unlike Brand/BaseUnit/BusinessType).
     * start_date/end_date formatted to plain strings, not left as the Carbon
     * instances `only()` would return under the model's `date:Y-m-d` cast —
     * see ProductGradeController::auditFields()'s docblock for why that
     * matters for the $oldFields !== $newFields diff below.
     */
    private function auditFields(CommissionGroup $commissionGroup): array
    {
        $prefix = "commission_group#{$commissionGroup->id}";

        $fields = collect($commissionGroup->only([
            'code', 'p_group_name', 'divisor_start', 'divisor_secondary', 'is_active', 'remark',
        ]))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
        $fields["{$prefix}.start_date"] = $commissionGroup->start_date?->format('Y-m-d');
        $fields["{$prefix}.end_date"] = $commissionGroup->end_date?->format('Y-m-d');

        return $fields;
    }
}
