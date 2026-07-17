<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    use Auditable;

    public $timestamps = false;

    protected $fillable = [
        'code',
    ];
}
