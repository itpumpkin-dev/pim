<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use Illuminate\Support\Facades\Storage;

class AttributeValueFormatter
{
    /**
     * แปลงค่า attribute ดิบที่เก็บไว้ในฐานข้อมูลให้เป็นรูปแบบที่ใช้แสดงผลจริงได้ —
     * ค่าแบบ image/file/video/gallery จะถูกเก็บเป็น path แบบ relative บน disk
     * 'public' (ดูส่วนจัดการอัปโหลดใน ProductController) เลยต้อง build URL โดย
     * อิงกับ disk ตัวนั้นเป๊ะๆ ถึงจะโหลดได้จริง
     *
     * จงใจไม่ใช้ `Storage::url()` (facade ที่ใช้ disk default) เพราะมันจะไป
     * resolve ตาม FILESYSTEM_DISK ที่ตั้งค่าไว้ (ในที่นี้คือ 'local' ซึ่งไม่ใช่
     * disk ที่เก็บไฟล์พวกนี้อยู่ด้วยซ้ำ) และ — เพราะ disk 'local' ไม่มี key 'url' —
     * มันจะเงียบๆ fallback ไปเป็น path เปล่าๆ แบบ `/storage/...` ที่ไม่มี scheme
     * หรือ host เลย ซึ่งไม่มีปัญหาถ้าเรียกจาก browser ฝั่งเดียวกัน (same-origin)
     * แต่ใช้ไม่ได้เลยกับผู้บริโภคภายนอกอย่าง Lazada API ที่ต้องการ URL แบบ absolute
     * ที่เข้าถึงได้จากสาธารณะจริงๆ
     */
    public static function format(Attribute $attribute, ?string $rawValue): mixed
    {
        if ($rawValue === null || $rawValue === '') {
            return null;
        }

        if ($attribute->type === 'gallery') {
            $paths = json_decode($rawValue, true) ?: [];

            return array_map(fn ($path) => self::resolveStorageUrl($path), $paths);
        }

        if (in_array($attribute->type, ['image', 'file', 'video'], true)) {
            return self::resolveStorageUrl($rawValue);
        }

        return $rawValue;
    }

    /**
     * สร้าง public URL ให้ค่าที่เก็บไว้แบบ image/file/video/gallery —
     * ยกเว้นกรณีที่มันเป็น absolute URL อยู่แล้ว ซึ่งจะเกิดกับข้อมูลที่นำเข้ามา
     * ผ่านการ import (เช่น คอลัมน์ `pimage` ของ CSV ที่แปลงมาจาก WooCommerce
     * จะพก URL รูปภายนอกตัวจริงมาด้วย โดยไม่เคยถูกดาวน์โหลดมาเก็บใน local storage
     * เลย) ถ้าเอาค่านี้ไปวิ่งผ่าน Storage::url() มันจะเอาไปแปะซ้อนใต้ prefix
     * /storage/ ของแอปเรา แล้วทำให้ลิงก์พัง เลยต้องปล่อยค่าที่เป็น absolute
     * อยู่แล้วผ่านไปโดยไม่แตะต้อง
     */
    public static function resolveStorageUrl(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }

        return Storage::disk('public')->url($path);
    }
}
