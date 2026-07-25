<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Http\Requests\System\StoreJobPositionRequest;
use App\Http\Requests\System\UpdateJobPositionRequest;
use App\Models\JobPosition;
use App\Services\GridManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class JobPositionController extends Controller
{
    public function index(Request $request)
    {
        $grid = new GridManager('job_position_grid');

        return Inertia::render('system/jobPosition/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('system/jobPosition/create');
    }

    public function store(StoreJobPositionRequest $request): RedirectResponse
    {
        JobPosition::create([
            'name' => $request->name,
            'enabled' => $request->enabled,
        ]);

        return to_route('system.jobPosition.index')->with('success', 'Job position created successfully.');
    }

    public function edit(JobPosition $jobPosition): Response
    {
        return Inertia::render('system/jobPosition/edit', [
            'jobPosition' => [
                'id' => $jobPosition->id,
                'name' => $jobPosition->name,
                'enabled' => $jobPosition->enabled,
            ],
        ]);
    }

    public function update(UpdateJobPositionRequest $request, JobPosition $jobPosition): RedirectResponse
    {
        $jobPosition->update([
            'name' => $request->name,
            'enabled' => $request->enabled,
        ]);

        return to_route('system.jobPosition.index')->with('success', 'Job position updated successfully.');
    }

    public function destroy(JobPosition $jobPosition): RedirectResponse
    {
        $jobPosition->delete();

        return to_route('system.jobPosition.index');
    }
}
