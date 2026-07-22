<?php

namespace App\Http\Middleware;

use App\Models\Locale;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SetLocale
{
    /**
     * Resolve the active UI locale for this request and apply it to the
     * application, so it's already in effect when HandleInertiaRequests
     * shares data and when validation/translation strings are rendered.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $available = Locale::where('enabled', true)->pluck('code')->all();

        $code = $request->user()?->uiLocale?->code
            ?? $request->cookie('locale')
            ?? config('app.locale');

        if (!in_array($code, $available, true)) {
            $code = config('app.locale');
        }

        App::setLocale($code);

        return $next($request);
    }
}
