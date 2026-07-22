<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string $resource, string $action): Response
    {
        $user = $request->user();

        abort_unless($user && $user->hasPermission($resource, $action), 403, 'You do not have permission to perform this action.');

        return $next($request);
    }
}
