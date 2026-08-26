<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * ตัวเช็คสิทธิ์ "Attribute Access" ที่ใช้ร่วมกันหลายที่ — เช็คว่า role ของ user
 * คนนั้นดู/แก้ Attribute Group หรือ Attribute แต่ละตัวได้ไหม ย้ายโค้ดมาจาก
 * ProductController (ที่ยังเป็นที่หลักที่ออกแบบกฎพวกนี้ไว้ — หน้าแก้ไขสินค้า)
 * เพื่อให้เอากฎเดียวกันไปใช้กับหน้าอื่นๆ ที่โชว์ค่า attribute นอกเหนือจากหน้านั้นได้ด้วย
 * เช่น คอลัมน์ import/export สินค้าแบบ bulk และหน้า preview สินค้าแบบสาธารณะ (ไม่ต้อง login)
 */
class AttributeAccessPolicy
{
    /**
     * เช็คว่าจะใช้สิทธิ์ของ role ไหนมากำหนดผล: ของ user คนนั้นเอง หรือ — ถ้าไม่มี
     * user เลย (ผู้เข้าชมแบบไม่ login) — ก็ใช้ role `is_guest` ที่ตั้งไว้ (ถ้ามีการ
     * ตั้งค่าไว้ ดู Role::guest()) ค่า null หมายถึง "ไม่จำกัดสิทธิ์เลย" เพื่อให้
     * พฤติกรรมเดิมของผู้เข้าชมแบบไม่ login ยังทำงานเหมือนเดิมในระบบที่ยังไม่ได้ตั้ง
     * guest role
     */
    private function actorFor(?User $user): User|Role|null
    {
        return $user ?? Role::guest();
    }

    /**
     * ใช้รูปแบบ permission: 'view_attribute_groups.view_{group_code}'
     * ถ้า role นั้นไม่เคยแตะส่วน "Attribute Access" เลย (ไม่มีข้อมูล permission
     * สำหรับ resource นี้) จะอนุญาตให้เข้าถึงได้โดย default — เพื่อให้ยังใช้งานได้กับ
     * role เก่าๆ ที่มีมาก่อนจะมี permission ตัวนี้
     */
    public function canViewGroup(?User $user, AttributeGroup $group): bool
    {
        $actor = $this->actorFor($user);
        if (!$actor) {
            return true;
        }

        if (!$actor->hasAnyPermissionForResource('view_attribute_groups')) {
            return true;
        }

        return $actor->hasPermission('view_attribute_groups', "view_{$group->code}");
    }

    /**
     * ใช้รูปแบบ permission: 'view_attributes.view_{attribute_code}' ใช้ fallback
     * แบบเดียวกับ canViewGroup() คือ "ยังไม่เคยตั้งค่า resource นี้เลย = อนุญาตโดย default"
     */
    public function canViewAttribute(?User $user, Attribute $attribute): bool
    {
        $actor = $this->actorFor($user);
        if (!$actor) {
            return true;
        }

        if (!$actor->hasAnyPermissionForResource('view_attributes')) {
            return true;
        }

        return $actor->hasPermission('view_attributes', "view_{$attribute->code}");
    }

    /**
     * สิทธิ์แก้ไขต้องเป็น subset ของสิทธิ์ดูเสมอ จะ fallback เป็น "แก้ไขได้" ก็ต่อเมื่อ
     * role นั้นไม่เคยแตะเรื่องสิทธิ์ attribute group เลยจริงๆ (ไม่มีแม้แต่ข้อมูลฝั่ง view) —
     * เพราะ role ที่ให้สิทธิ์แค่ดูอย่างเดียว (มีข้อมูลฝั่ง view แต่ไม่เคยติ๊ก Edit เลย)
     * ก็จะไม่มีข้อมูล edit_attribute_groups เหมือนกัน ซึ่งถ้าเช็คแค่ resource นี้เดี่ยวๆ
     * จะ fallback เป็น "แก้ไขได้" ผิดๆ ไปด้วย
     */
    public function canEditGroup(?User $user, AttributeGroup $group): bool
    {
        if (!$this->canViewGroup($user, $group)) {
            return false;
        }

        $actor = $this->actorFor($user);
        if (!$actor) {
            return true;
        }

        if (!$actor->hasAnyPermissionForResource('view_attribute_groups') && !$actor->hasAnyPermissionForResource('edit_attribute_groups')) {
            return true;
        }

        return $actor->hasPermission('edit_attribute_groups', "edit_{$group->code}");
    }

    /**
     * ใช้ fallback แบบ "ไม่เคยแตะเลยจริงๆ" เหมือนกับ canEditGroup() ด้านบน
     */
    public function canEditAttribute(?User $user, Attribute $attribute): bool
    {
        if (!$this->canViewAttribute($user, $attribute)) {
            return false;
        }

        $actor = $this->actorFor($user);
        if (!$actor) {
            return true;
        }

        if (!$actor->hasAnyPermissionForResource('view_attributes') && !$actor->hasAnyPermissionForResource('edit_attributes')) {
            return true;
        }

        return $actor->hasPermission('edit_attributes', "edit_{$attribute->code}");
    }

    /**
     * จะ true ก็ต่อเมื่อมี attribute group อย่างน้อยหนึ่งกลุ่มที่ user/role นี้ดูไม่ได้
     * ต่างจากการเช็คแบบหยาบๆ ว่า "resource view_attribute_groups เคยถูกแตะไหม" —
     * เมธอดนี้จะถือว่า role ที่ได้รับสิทธิ์ดูทุกกลุ่มแบบระบุชัดเจน เหมือนกับ role ที่
     * ไม่เคยแตะส่วนนี้เลย (ทั้งสองแบบถือว่า "ไม่ถูกจำกัด") แทนที่จะตีความว่าการให้
     * สิทธิ์แบบระบุชัดคือการจำกัดสิทธิ์ ใช้เมธอดนี้เพื่อเช็คหน้ารายละเอียด job
     * import/export ซึ่งเช็คกับ group ใดกลุ่มหนึ่งไม่ได้ เพราะข้อมูลของ job สินค้า
     * ครอบคลุมทุก attribute group พร้อมกัน
     */
    public function hasAnyGroupRestriction(?User $user): bool
    {
        if (!$this->actorFor($user)) {
            return false;
        }

        return AttributeGroup::all()->contains(fn (AttributeGroup $group) => !$this->canViewGroup($user, $group));
    }

    /**
     * การเป็นสมาชิกของ group นั้นผูกอยู่กับแต่ละ family (family_attributes.
     * attribute_group_id) ไม่ได้ fix ตายตัวอยู่ที่ตัว attribute เอง — attribute
     * ตัวเดียวกันอาจอยู่ใน group ที่อนุญาตสำหรับ family หนึ่ง แต่อยู่ใน group ที่ถูก
     * จำกัดสำหรับอีก family หนึ่งก็ได้ การ export/import แบบ bulk ไม่ได้จำกัดอยู่แค่
     * family เดียว เมธอดนี้เลยถามคำถามแบบระมัดระวังที่สุด: $attribute นี้ดูได้ไหม
     * ถ้านับรวม *ทุก* family ที่มันถูก assign อยู่ แค่มี group ที่ถูกจำกัดอยู่ group
     * เดียวก็พอที่จะตัดออกแล้ว — สอดคล้องกับแนวทางที่ใช้ทั่วทั้งระบบว่า "มีการจำกัด
     * ตรงไหนก็ตาม" ให้ถือเป็นค่า default ที่ปลอดภัยกว่า
     *
     * @param  callable(?User, Attribute): bool  $attributeCheck  canViewAttribute หรือ canEditAttribute
     * @param  callable(?User, AttributeGroup): bool  $groupCheck  canViewGroup หรือ canEditGroup
     */
    private function acrossFamilies(?User $user, Attribute $attribute, callable $attributeCheck, callable $groupCheck): bool
    {
        if (!$attributeCheck($user, $attribute)) {
            return false;
        }

        if (!$this->actorFor($user)) {
            return true;
        }

        foreach (FamilyAttribute::where('attribute_id', $attribute->id)->with('attributeGroup')->get() as $familyAttribute) {
            if ($familyAttribute->attributeGroup && !$groupCheck($user, $familyAttribute->attributeGroup)) {
                return false;
            }
        }

        return true;
    }

    public function canViewAttributeAcrossFamilies(?User $user, Attribute $attribute): bool
    {
        return $this->acrossFamilies($user, $attribute, [$this, 'canViewAttribute'], [$this, 'canViewGroup']);
    }

    public function canEditAttributeAcrossFamilies(?User $user, Attribute $attribute): bool
    {
        return $this->acrossFamilies($user, $attribute, [$this, 'canEditAttribute'], [$this, 'canEditGroup']);
    }

    /**
     * เป็นเวอร์ชันแบบ batch ของ canViewAttributeAcrossFamilies()/canEditAttributeAcrossFamilies()
     * ไว้กรอง attribute ทั้งลิสต์ (เช่น คอลัมน์ export/import) โดยใช้จำนวน query
     * ที่จำกัด แทนที่จะ query หา family ทีละ attribute
     *
     * @param  Collection<int, Attribute>  $attributes
     * @param  'view'|'edit'  $mode
     * @return Collection<int, Attribute>
     */
    public function filterAttributes(?User $user, Collection $attributes, string $mode = 'view'): Collection
    {
        if ($attributes->isEmpty() || !$this->actorFor($user)) {
            return $attributes;
        }

        $attributeCheck = $mode === 'edit' ? [$this, 'canEditAttribute'] : [$this, 'canViewAttribute'];
        $groupCheck = $mode === 'edit' ? [$this, 'canEditGroup'] : [$this, 'canViewGroup'];

        $groupsByAttributeId = FamilyAttribute::whereIn('attribute_id', $attributes->pluck('id'))
            ->with('attributeGroup')
            ->get()
            ->groupBy('attribute_id');

        return $attributes->filter(function (Attribute $attribute) use ($user, $attributeCheck, $groupCheck, $groupsByAttributeId) {
            if (!$attributeCheck($user, $attribute)) {
                return false;
            }

            foreach ($groupsByAttributeId->get($attribute->id, collect()) as $familyAttribute) {
                if ($familyAttribute->attributeGroup && !$groupCheck($user, $familyAttribute->attributeGroup)) {
                    return false;
                }
            }

            return true;
        })->values();
    }

    /**
     * เหมือนกับ filterAttributes() แต่รับเป็นลิสต์ธรรมดาของ attribute code
     * (เช่น คอลัมน์ import/export สินค้าแบบ bulk) แทนที่จะเป็น Attribute model —
     * แปลง code เป็น model ก่อน กรอง แล้วคืนเฉพาะ code ที่ผ่านเงื่อนไข โดยเรียง
     * ตามลำดับเดิม
     *
     * @param  array<int, string>  $codes
     * @param  'view'|'edit'  $mode
     * @return array<int, string>
     */
    public function filterAttributeCodes(?User $user, array $codes, string $mode = 'view'): array
    {
        if (empty($codes) || !$this->actorFor($user)) {
            return $codes;
        }

        $attributes = Attribute::whereIn('code', $codes)->get(['id', 'code']);
        $allowedCodes = $this->filterAttributes($user, $attributes, $mode)->pluck('code')->all();

        return array_values(array_filter($codes, fn ($code) => in_array($code, $allowedCodes, true)));
    }
}
