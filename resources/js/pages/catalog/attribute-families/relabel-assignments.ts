// ชื่อ attribute/group ที่อยู่ใน local state (assignedGroups/unassignedAttrs)
// ถูก copy มาจาก props ตอนเปิดหน้า — พอสลับภาษา useLocale() จะ router.reload()
// ให้ props มาเป็นภาษาใหม่ แต่ state ยังถือชื่อภาษาเดิมอยู่ ฟังก์ชันพวกนี้เอา
// ชื่อใหม่จาก props ไปแทนตาม id โดยไม่แตะการจัดเรียงที่ผู้ใช้ลากไว้แล้ว

interface Named {
    id: number;
    name?: string;
}

export function relabelAttributes<A extends Named>(list: A[], byId: Map<number, Named>): A[] {
    return list.map((a) => {
        const fresh = byId.get(a.id)?.name;
        return fresh && fresh !== a.name ? { ...a, name: fresh } : a;
    });
}

export function relabelGroups<G extends Named & { attributes: A[] }, A extends Named>(
    list: G[],
    groupsById: Map<number, Named>,
    attributesById: Map<number, Named>,
): G[] {
    return list.map((g) => ({
        ...g,
        name: groupsById.get(g.id)?.name || g.name,
        attributes: relabelAttributes(g.attributes, attributesById),
    }));
}
