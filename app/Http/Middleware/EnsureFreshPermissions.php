<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/**
 * Logs a user out the moment they're no longer supposed to be logged in:
 * their permissions changed (role edited, role/group membership changed,
 * etc.) or their account was disabled. The version issued at login is
 * stashed in the session; a mismatch against the user's current
 * `permissions_version` means an admin changed something that affects them
 * since, so the session is no longer trustworthy. `enabled` is re-checked
 * directly against the database on every request, since a disabled account
 * must not keep working off an already-open session.
 */
class EnsureFreshPermissions
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->enabled) {
            return $this->forceLogout($request, __('auth.disabled'));
        }

        if ($user && $request->session()->get('permissions_version') !== $user->permissions_version) {
            return $this->forceLogout($request, __('messages.permissions_changed'));
        }

        return $next($request);
    }

    private function forceLogout(Request $request, string $message): Response
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();
        $request->session()->flash('status', $message);

        if ($request->header('X-Inertia')) {
            return Inertia::location(route('login'));
        }

        return redirect()->route('login');
    }
}
