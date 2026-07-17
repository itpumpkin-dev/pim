<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        $admin = Role::firstOrCreate(['label' => 'admin']);

        $user = User::factory()->create([
            'username' => 'adminuser',
            'first_name' => 'admin',
            'last_name' => 'pk',
            'email' => 'admin@pimpk.com',
        ]);

        $user->roles()->attach($admin);
    }
}
