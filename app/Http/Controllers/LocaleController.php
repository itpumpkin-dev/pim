<?php

namespace App\Http\Controllers;

use App\Models\Locale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Validation\Rule;

class LocaleController extends Controller
{
    /**
     * Switch the active UI locale. Persists to the authenticated user's
     * profile when logged in; always sets a cookie so guests (e.g. on the
     * login page) get a working switcher too.
     *
     * Called from a background fetch (see useLocale()'s setLocale()), not
     * through Inertia — every UI string is already bundled client-side, so
     * there's nothing worth reloading the current page for. Returns a plain
     * JSON ack instead of `back()`'s full-page redirect, which would force
     * the server to re-render whatever page the user's on for a response
     * the client throws away anyway.
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', Rule::exists('locales', 'code')->where('enabled', true)],
        ]);

        $locale = Locale::where('code', $validated['code'])->where('enabled', true)->firstOrFail();

        if ($request->user()) {
            $request->user()->update(['ui_locale_id' => $locale->id]);
        }

        Cookie::queue('locale', $locale->code, 60 * 24 * 365);

        return response()->json(['code' => $locale->code]);
    }
}
