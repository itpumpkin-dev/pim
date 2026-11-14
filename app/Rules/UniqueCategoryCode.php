<?php

namespace App\Rules;

use App\Models\Category;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * code หมวดหมู่ต้องไม่ซ้ำกันแบบไม่สนตัวพิมพ์ — option ของ master หมวดหมู่เก็บ code เป็นตัวพิมพ์เล็กเสมอ
 * (AttributeOptionMirror::normaliseCode) หมวด 'L001' กับ 'l001' จึงได้ option เดียวกันและแยกไม่ออก
 * (DB cleanup Phase 3b — กรณีจริง: L001 ปั้มจุ่ม ชนกับ l001 ปั้มน้ำหอยโข่ง)
 */
class UniqueCategoryCode implements ValidationRule
{
    public function __construct(private readonly ?int $ignoreId = null) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $code = trim((string) $value);
        if ($code === '') {
            return;
        }

        $taken = Category::whereRaw('lower(code) = ?', [strtolower($code)])
            ->when($this->ignoreId, fn ($query) => $query->whereKeyNot($this->ignoreId))
            ->value('code');

        if ($taken !== null) {
            $fail("The code \"{$code}\" is already used by category \"{$taken}\" (codes must differ by more than upper/lower case).");
        }
    }
}
