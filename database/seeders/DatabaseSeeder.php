<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        $admin = Role::firstOrCreate(['label' => 'Administrator']);

        $this->grantAllPermissions($admin);

        $user = User::query()->where('username', 'adminuser')->first()
            ?? User::factory()->create([
                'username' => 'adminuser',
                'first_name' => 'admin',
                'last_name' => 'pk',
                'email' => 'admin@pimpk.com',
            ]);

        $user->roles()->syncWithoutDetaching($admin);

        $member = Role::firstOrCreate(['label' => 'Member']);
        $member->permissions()->updateOrCreate(
            ['resource' => 'dashboards', 'action' => 'list_dashboards'],
            ['granted' => true],
        );
    }

    /**
     * Grant the given role every resource/action pair guarded by the
     * `permission:` route middleware, so a fresh seed isn't locked out
     * of the app it was just seeded for.
     */
    private function grantAllPermissions(Role $role): void
    {
        $routeFiles = File::glob(base_path('routes/*.php'));
        $pairs = [];

        foreach ($routeFiles as $file) {
            preg_match_all('/permission:([a-zA-Z_]+),([a-zA-Z_]+)/', File::get($file), $matches, PREG_SET_ORDER);

            foreach ($matches as $match) {
                $pairs[$match[1].'|'.$match[2]] = ['resource' => $match[1], 'action' => $match[2]];
            }
        }

        foreach ($pairs as $pair) {
            $role->permissions()->updateOrCreate(
                ['resource' => $pair['resource'], 'action' => $pair['action']],
                ['granted' => true],
            );
        }
    }
}
