<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$request = new \Illuminate\Http\Request([
    'password' => '123456',
    'password_confirmation' => '123456',
]);

$validator = Validator::make($request->all(), [
    'password' => ['nullable', 'confirmed', \Illuminate\Validation\Rules\Password::defaults()],
]);

if ($validator->fails()) {
    echo "FAILS:\n";
    print_r($validator->errors()->toArray());
} else {
    echo "PASSES\n";
}
