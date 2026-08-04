<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyApiKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $configuredKey = config('services.ecommerce_api.key');
        $providedKey = $request->header('X-API-Key');

        if (!$configuredKey || !$providedKey || !hash_equals($configuredKey, $providedKey)) {
            return response()->json(['message' => 'Invalid or missing API key'], 401);
        }

        return $next($request);
    }
}
