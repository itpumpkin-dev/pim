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

        return $modules;
    }
}
