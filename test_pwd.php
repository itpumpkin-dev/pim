<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$u = App\Models\User::find(4);
echo "BEFORE: " . $u->password_hash . "\n";
$u->password_hash = '12345678';
$u->save();
$u->refresh();
echo "AFTER: " . $u->password_hash . "\n";
