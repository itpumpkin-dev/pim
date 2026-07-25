<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

// Only the account owner may listen on their own private channel — this is
// what carries the "your permissions changed, log in again" notification.
Broadcast::channel('user.{id}', function (User $user, int $id) {
    return $user->id === $id;
});
