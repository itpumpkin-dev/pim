<?php

namespace App\Exceptions;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Turns a 403 into something a signed-in user can actually read, instead of
 * Laravel's bare "403 | Forbidden" page (which Inertia shows as a raw HTML
 * modal on top of the app when the 403 comes back from a client-side visit):
 *
 *  - Inertia visit (clicking a link/button inside the app) → bounce back to
 *    the page the user was on, with the reason flashed as `error` so
 *    FlashToast shows it as a red toast.
 *  - Full page load (typed/bookmarked URL, refresh) → the errors/forbidden
 *    Inertia page, rendered inside the normal app shell, still status 403.
 *
 * JSON/axios callers, guests, and session-less (api) requests keep the
 * original 403 response untouched.
 */
class ForbiddenResponder
{
    /** Default/framework messages that carry no detail worth showing as-is. */
    private const GENERIC_MESSAGES = [
        '',
        'Forbidden',
        'This action is unauthorized.',
        'You do not have permission to perform this action.',
    ];

    public static function handle(Response $response, Throwable $exception, Request $request): Response
    {
        if ($request->expectsJson() || ! $request->hasSession() || ! $request->user()) {
            return $response;
        }

        $message = self::message($exception);

        if ($request->header('X-Inertia')) {
            // A hover-prefetch must not plant a flash the user never asked for.
            if ($request->header('Purpose') === 'prefetch') {
                return $response;
            }

            $previous = url()->previous();
            // Bouncing back to the URL that just 403'd would loop forever
            // (e.g. a router.reload() on a page whose access was just revoked).
            $target = $previous && $previous !== $request->fullUrl() && $previous !== $request->url()
                ? $previous
                : route('dashboard');

            return redirect($target, 303)->with('error', $message);
        }

        return Inertia::render('errors/forbidden', ['message' => $message])
            ->toResponse($request)
            ->setStatusCode(Response::HTTP_FORBIDDEN);
    }

    private static function message(Throwable $exception): string
    {
        $message = trim($exception->getMessage());

        return in_array($message, self::GENERIC_MESSAGES, true)
            ? __('messages.forbidden')
            : __($message);
    }
}
