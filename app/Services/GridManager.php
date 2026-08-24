<?php

namespace App\Services;

use Symfony\Component\Yaml\Yaml;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Http\Request;
use Illuminate\Database\Eloquent\Builder;

class GridManager
{
    protected string $name;
    protected array $config;

    public function __construct(string $name)
    {
        $this->name = $name;
        $path = resource_path("grids/{$name}.yml");

        if (!File::exists($path)) {
            throw new \Exception("Grid configuration file not found: {$path}");
        }

        // Every list page (Users, Roles, Products, Attribute Groups/Families,
        // ...) instantiates a GridManager on every single request, and this
        // YAML file never changes at runtime — parsing it fresh each time
        // was pure repeated work. Keyed on the file's mtime so editing a
        // grid's YAML during development is picked up automatically, no
        // manual cache:clear needed.
        $yaml = Cache::rememberForever(
            "grid_config:{$name}:" . File::lastModified($path),
            fn () => Yaml::parseFile($path),
        );

        if (!isset($yaml['datagrid'][$name])) {
            throw new \Exception("Grid definition '{$name}' not found in YAML file.");
        }

        $this->config = $yaml['datagrid'][$name];
    }
    
    public function getConfig(): array
    {
        return $this->config;
    }
    
    /**
     * @param callable(Builder): void|null $extra Optional extra query constraints
     *        applied before pagination — for callers that need filtering GridManager
     *        itself can't express (e.g. Products' EAV attribute-value filters).
     */
    public function getData(Request $request, ?callable $extra = null)
    {
        $sourceType = $this->config['source']['type'] ?? 'eloquent';
        $modelClass = $this->config['source']['class'] ?? null;

        if ($sourceType !== 'eloquent' || !$modelClass) {
            throw new \Exception("Unsupported data source.");
        }

        $query = $modelClass::query();

        // Handle Global Search Filter
        $search = $request->input('search');
        if ($search && isset($this->config['filters']['global']['fields'])) {
            $fields = $this->config['filters']['global']['fields'];

            $query->where(function ($q) use ($fields, $search) {
                foreach ($fields as $index => $field) {
                    if ($index === 0) {
                        $q->where($field, 'like', "%{$search}%");
                    } else {
                        $q->orWhere($field, 'like', "%{$search}%");
                    }
                }
            });
        }

        // Handle per-field Filters (only columns explicitly marked filterable: true)
        // Cast, not just a `, []` default — Laravel's ConvertEmptyStringsToNull
        // middleware turns an empty `filters` query param (`?filters=`) into a
        // literal null, and Request::input()'s default only applies when the
        // key is missing entirely, not when it's present-but-null. `(array)`
        // normalizes both that case and null to [] without changing the
        // already-correct array case.
        self::applyFilters($query, $this->config['columns'], (array) $request->input('filters', []));

        if ($extra) {
            $extra($query);
        }

        // Handle Sorting
        $sortField = $request->input('sort');
        $sortDir = $request->input('dir', 'asc');

        if ($sortField && isset($this->config['columns'][$sortField]) && ($this->config['columns'][$sortField]['sortable'] ?? false)) {
            $query->orderBy($sortField, strtolower($sortDir) === 'desc' ? 'desc' : 'asc');
        } elseif (!$sortField) {
            // No explicit sort requested — fall back to this grid's own
            // `default_sort` (opt-in per grid via its YAML, e.g.
            // product_grid.yml's `updated_at desc`) rather than leaving the
            // query with no ORDER BY at all, which left row order to
            // whatever the database happened to return (effectively
            // undefined, not a real "default"). Grids with no `default_sort`
            // configured keep their previous unordered behavior unchanged.
            $default = $this->config['default_sort'] ?? null;
            $defaultField = $default['field'] ?? null;
            if ($defaultField && isset($this->config['columns'][$defaultField])) {
                $query->orderBy($defaultField, strtolower($default['dir'] ?? 'asc') === 'desc' ? 'desc' : 'asc');
            }
        }

        $perPage = (int) $request->input('per_page', 10);
        if (!in_array($perPage, [10, 25, 50], true)) {
            $perPage = 10;
        }

        return $query->paginate($perPage)->withQueryString();
    }

    /**
     * Apply per-field where-clauses to a query, given a set of column
     * definitions (each needing at least a `type` and `filterable: true`)
     * and the raw `filters` request input. Shared by grids driven through
     * this class and by controllers that build their own query directly
     * (e.g. Categories/Channels, which have no YAML grid config) so the
     * same filtering behavior/UI (GridFilterDrawer) works everywhere.
     *
     * @param array<string, array{type?: string, filterable?: bool}> $columns
     * @param array<string, mixed> $filters
     */
    public static function applyFilters(Builder $query, array $columns, array $filters): void
    {
        foreach ($filters as $field => $value) {
            $column = $columns[$field] ?? null;
            if (!$column || !($column['filterable'] ?? false)) {
                continue;
            }

            $type = $column['type'] ?? 'string';

            if (in_array($type, ['datetime', 'date'], true)) {
                if (!is_array($value)) {
                    continue;
                }
                if (!empty($value['from'])) {
                    $query->whereDate($field, '>=', $value['from']);
                }
                if (!empty($value['to'])) {
                    $query->whereDate($field, '<=', $value['to']);
                }
            } elseif ($type === 'boolean') {
                if ($value === '' || $value === null) {
                    continue;
                }
                $query->where($field, $value === '1' || $value === 1 || $value === true);
            } elseif ($type === 'select') {
                if ($value === '' || $value === null) {
                    continue;
                }
                $query->where($field, $value);
            } else {
                if ($value === '' || $value === null) {
                    continue;
                }
                $query->where($field, 'like', "%{$value}%");
            }
        }
    }
}
