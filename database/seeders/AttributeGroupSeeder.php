<?php

namespace Database\Seeders;

use App\Models\AttributeGroup;
use Illuminate\Database\Seeder;

class AttributeGroupSeeder extends Seeder
{
    private const GROUPS = [
        'general' => 'ข้อมูลทั่วไป',
        'pricing_packaging' => 'ราคาและบรรจุภัณฑ์',
        'specifications' => 'ข้อมูลจำเพาะ',
        'warranty_usage' => 'การรับประกันและการใช้งาน',
    ];

    public function run(): void
    {
        foreach (self::GROUPS as $code => $name) {
            AttributeGroup::updateOrCreate(['code' => $code], ['name' => $name]);
        }
    }
}
