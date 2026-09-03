<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Currency extends Model
{
    use Auditable;

    public $timestamps = false;

    protected $with = ['translations'];

    protected $fillable = [
        'code',
        'name',
    ];

    public function channels(): BelongsToMany
    {
        return $this->belongsToMany(Channel::class, 'channel_currency');
    }

    public function vendors(): HasMany
    {
        return $this->hasMany(Vendor::class);
    }

    /**
     * ชื่อของ locale เริ่มต้นของแอปเก็บไว้ในคอลัมน์ `name` เป็น fallback ง่ายๆ —
     * คำแปลจริงของแต่ละภาษาอยู่ที่นี่ (ดู CurrencyTranslation)
     */
    public function translations(): HasMany
    {
        return $this->hasMany(CurrencyTranslation::class);
    }
}
