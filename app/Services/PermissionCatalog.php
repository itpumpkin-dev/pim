<?php

namespace App\Services;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

class PermissionCatalog
{
    public function getCatalog(): array
    {
        $modules = [];
        $routes = Route::getRoutes();

        foreach ($routes as $route) {
            $middlewares = $route->gatherMiddleware();
            foreach ($middlewares as $middleware) {
                if (is_string($middleware) && str_starts_with($middleware, 'permission:')) {
                    $parts = explode(':', $middleware);
                    if (isset($parts[1])) {
                        $args = explode(',', $parts[1]);
                        if (count($args) === 2) {
                            $resource = $args[0];
                            $action = $args[1];

                            $module = 'System'; // Default
                            $uriParts = explode('/', ltrim($route->uri(), '/'));
                            if (count($uriParts) > 0 && !empty($uriParts[0])) {
                                $module = $uriParts[0];
                            }

                            if (!isset($modules[$module])) {
                                $modules[$module] = [
                                    'label' => Str::headline($module),
                                    'resources' => [],
                                ];
                            }

                            if (!isset($modules[$module]['resources'][$resource])) {
                                $modules[$module]['resources'][$resource] = [
                                    'label' => Str::headline($resource),
                                    'actions' => [],
                                ];
                            }

                            if (!isset($modules[$module]['resources'][$resource]['actions'][$action])) {
                                $modules[$module]['resources'][$resource]['actions'][$action] = [
                                    'label' => Str::headline($action),
                                ];
                            }
                        }
                    }
                }
            }
        }

        $this->addControllerEnforcedPermissions($modules);

        return $modules;
    }

    /**
     * Permissions that are enforced inside a controller rather than by route
     * `permission:` middleware, so the route scan above can't discover them.
     *
     * `users.edit_users`: the user edit routes deliberately carry no
     * middleware so a user can always reach their own account (Settings);
     * UserController gates editing *someone else's* account on this
     * permission. Declared here so it still appears in the Roles picker and
     * gets granted to Administrator by `permissions:sync`.
     */
    private function addControllerEnforcedPermissions(array &$modules): void
    {
        $extra = [
            'system' => [
                'users' => ['edit_users'],
            ],
        ];

        foreach ($extra as $module => $resources) {
            $modules[$module]['label'] ??= Str::headline($module);
            $modules[$module]['resources'] ??= [];

            foreach ($resources as $resource => $actions) {
                $modules[$module]['resources'][$resource]['label'] ??= Str::headline($resource);
                $modules[$module]['resources'][$resource]['actions'] ??= [];

                foreach ($actions as $action) {
                    $modules[$module]['resources'][$resource]['actions'][$action] ??= [
                        'label' => Str::headline($action),
                    ];
                }
            }
        }
    }
}
