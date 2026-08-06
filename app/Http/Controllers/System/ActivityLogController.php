<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ActivityLogController extends Controller
{
    private const EVENTS = ['created', 'updated', 'deleted', 'login', 'logout'];

    public function index(Request $request): Response
    {
        $event = $request->query('event') ?: null;
        $userId = $request->query('user_id') ? (int) $request->query('user_id') : null;
        $dateFrom = $request->query('date_from') ?: null;
        $dateTo = $request->query('date_to') ?: null;

        $query = AuditLog::with('user')->orderBy('id', 'desc');

        if ($event) {
            $query->where('event', $event);
        }
        if ($userId) {
            $query->where('user_id', $userId);
        }
        if ($dateFrom) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        $paginated = $query->paginate(20)->withQueryString();
        $paginated->getCollection()->transform(fn (AuditLog $log) => [
            'id' => $log->id,
            'event' => $log->event,
            'user' => $log->user ? $log->user->name : 'System',
            'auditable_type' => $log->auditable_type ? basename(str_replace('\\', '/', $log->auditable_type)) : null,
            'auditable_id' => $log->auditable_id,
            'created_at' => $log->created_at->toIso8601String(),
        ]);

        return Inertia::render('system/activityLog/index', [
            'activities' => $paginated,
            'events' => self::EVENTS,
            'users' => User::orderBy('first_name')->get()->map(fn (User $user) => ['id' => $user->id, 'name' => $user->name]),
            'filters' => [
                'event' => $event,
                'user_id' => $userId,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ],
        ]);
    }
}
