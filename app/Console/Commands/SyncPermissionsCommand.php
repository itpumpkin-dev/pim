<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Role;
use App\Models\RolePermission;
use App\Services\PermissionCatalog;

class SyncPermissionsCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'permissions:sync';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Auto-assign all available permissions to the Administrator role';

    /**
     * Execute the console command.
     */
    public function handle(PermissionCatalog $catalog)
    {
        $adminRole = Role::where('label', 'Administrator')->first();

        if (!$adminRole) {
            $this->error('Role "Administrator" not found.');
            return Command::FAILURE;
        }

        $modules = $catalog->getCatalog();
        $assignedCount = 0;
        $totalFound = 0;

        foreach ($modules as $module) {
            foreach ($module['resources'] as $resourceKey => $resource) {
                foreach ($resource['actions'] as $actionKey => $action) {
                    $totalFound++;
                    
                    // Assign or ensure it is granted
                    $permission = RolePermission::firstOrCreate([
                        'role_id' => $adminRole->id,
                        'resource' => $resourceKey,
                        'action' => $actionKey,
                    ], [
                        'granted' => true,
                    ]);
                    
                    if ($permission->wasRecentlyCreated || !$permission->granted) {
                        $permission->update(['granted' => true]);
                        $assignedCount++;
                    }
                }
            }
        }

        // Optional: Clean up orphaned permissions (permissions in DB that no longer exist in routes)
        // This addresses the "garbage data" issue
        $validSignatures = [];
        foreach ($modules as $module) {
            foreach ($module['resources'] as $resourceKey => $resource) {
                foreach ($resource['actions'] as $actionKey => $action) {
                    $validSignatures[] = $resourceKey . ':' . $actionKey;
                }
            }
        }

        $deletedCount = 0;
        $dbPermissions = RolePermission::where('role_id', $adminRole->id)->get();
        foreach ($dbPermissions as $dbPerm) {
            $sig = $dbPerm->resource . ':' . $dbPerm->action;
            if (!in_array($sig, $validSignatures)) {
                $dbPerm->delete();
                $deletedCount++;
            }
        }

        $this->info("Scanned {$totalFound} total permissions from routes.");
        if ($assignedCount > 0) {
            $this->info("Assigned {$assignedCount} new permissions to Administrator.");
        }
        if ($deletedCount > 0) {
            $this->info("Cleaned up {$deletedCount} old/orphaned permissions.");
        }
        
        $this->info('Permissions sync completed successfully.');
        
        return Command::SUCCESS;
    }
}
