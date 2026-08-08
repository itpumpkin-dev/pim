<?php

namespace Database\Seeders;

use App\Models\AttributeGroup;
use Illuminate\Database\Seeder;

class AttributeGroupSeeder extends Seeder
{
    private const GROUPS = [
        'general' => 'ข้อมูลทั่วไป',
        // Split from the original combined "ราคาและบรรจุภัณฑ์" group — kept the
        // same `code` (pricing_packaging) so existing role permissions
        // targeting it keep meaning "can see pricing", and added a sibling
        // `packaging` group for everything else that used to share it.
        'pricing_packaging' => 'ราคา',
        'packaging' => 'บรรจุภัณฑ์',
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
