<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$credentials = [
    'email' => 'parinya.na@it.pumpkin.co.th',
    'password' => '12345678'
];

if (Auth::attempt($credentials)) {
    echo "LOGIN SUCCESS!\n";
} else {
    echo "LOGIN FAILED!\n";
}
