<?php

namespace App\Listeners;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Events\Dispatcher;

class AuditAuthEventSubscriber
{
    public function handleLogin(Login $event): void
    {
        /** @var User $user */
        $user = $event->user;

        AuditLog::record('login', $user, userId: $user->getKey());
    }

    public function handleLogout(Logout $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        AuditLog::record('logout', $event->user, userId: $event->user->getKey());
    }

    public function handleFailed(Failed $event): void
    {
        AuditLog::record('login_failed', newValues: [
            'email' => $event->credentials['email'] ?? null,
        ]);
    }

    public function subscribe(Dispatcher $events): array
    {
        return [
            Login::class => 'handleLogin',
            Logout::class => 'handleLogout',
            Failed::class => 'handleFailed',
        ];
    }
}
