<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Logs a user out the moment their permissions change while they're still
 * logged in (role permissions edited, role/group membership changed, etc.).
 * The version issued at login is stashed in the session; a mismatch against
 * the user's current `permissions_version` means an admin changed something
 * that affects them since, so the session is no longer trustworthy.
 */
class EnsureFreshPermissions
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $request->session()->get('permissions_version') !== $user->permissions_version) {
            Auth::guard('web')->logout();

            $request->session()->invalidate();
            $request->session()->regenerateToken();
            $request->session()->flash('status', __('messages.permissions_changed'));

            if ($request->header('X-Inertia')) {
                return Inertia::location(route('login'));
            }

            return redirect()->route('login');
        }

        return $next($request);
    }
}
