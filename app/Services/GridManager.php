<?php

namespace App\Services;

use Symfony\Component\Yaml\Yaml;
use Illuminate\Support\Facades\File;
use Illuminate\Http\Request;

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
        
        $yaml = Yaml::parseFile($path);
        
        if (!isset($yaml['datagrid'][$name])) {
            throw new \Exception("Grid definition '{$name}' not found in YAML file.");
        }
        
        $this->config = $yaml['datagrid'][$name];
    }
    
    public function getConfig(): array
    {
        return $this->config;
    }
    
    public function getData(Request $request)
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
        
        // Handle Sorting
        $sortField = $request->input('sort');
        $sortDir = $request->input('dir', 'asc');
        
        if ($sortField && isset($this->config['columns'][$sortField]) && ($this->config['columns'][$sortField]['sortable'] ?? false)) {
            $query->orderBy($sortField, strtolower($sortDir) === 'desc' ? 'desc' : 'asc');
        }
        
        return $query->paginate(10)->withQueryString();
    }
}
