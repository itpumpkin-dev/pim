<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Http\Requests\System\StoreDepartmentRequest;
use App\Http\Requests\System\UpdateDepartmentRequest;
use App\Models\Department;
use App\Services\GridManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DepartmentController extends Controller
{
    public function index(Request $request)
    {
        $grid = new GridManager('department_grid');

        return Inertia::render('system/department/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('system/department/create');
    }

    public function store(StoreDepartmentRequest $request): RedirectResponse
    {
        Department::create([
            'name' => $request->name,
            'enabled' => $request->enabled,
        ]);

        return to_route('system.department.index')->with('success', 'Department created successfully.');
    }

    public function edit(Department $department): Response
    {
        return Inertia::render('system/department/edit', [
            'department' => [
                'id' => $department->id,
                'name' => $department->name,
                'enabled' => $department->enabled,
            ],
        ]);
    }

    public function update(UpdateDepartmentRequest $request, Department $department): RedirectResponse
    {
        $department->update([
            'name' => $request->name,
            'enabled' => $request->enabled,
        ]);

        return to_route('system.department.index')->with('success', 'Department updated successfully.');
    }

    public function destroy(Department $department): RedirectResponse
    {
        $department->delete();

        return to_route('system.department.index');
    }
}
