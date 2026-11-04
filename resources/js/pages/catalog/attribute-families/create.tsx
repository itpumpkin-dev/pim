import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/folder-blank.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-down.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sys-add.js';
import '@ui5/webcomponents-icons/dist/sys-minus.js';
import '@ui5/webcomponents-icons/dist/vertical-grip.js';
import {
    Bar,
    BusyIndicator,
    Button,
    Dialog,
    Icon,
    Input,
    Label,
    Menu,
    MenuItem,
    MessageStrip,
    MultiComboBox,
    MultiComboBoxItem,
    Text,
    Title,
} from '@ui5/webcomponents-react';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './create.module.css';
import { relabelAttributes, relabelGroups } from './relabel-assignments';

interface AttributeGroup {
    id: number;
    code: string;
    name?: string;
}

interface AttributeItem {
    id: number;
    code: string;
    name: string;
    type: string;
}

interface AssignedGroup {
    id: number;
    code: string;
    name: string;
    attributes: AttributeItem[];
    expanded: boolean;
}

interface AttributeFamilyOption {
    id: number;
    code: string;
    name?: string;
}

interface FamilyAttributePivot {
    attribute_id: number;
    attribute_group_id: number;
    attribute?: AttributeItem;
    attribute_group?: AttributeGroup;
}

interface TemplatePreviewGroup {
    id: number;
    code: string;
    name: string;
    attributes: AttributeItem[];
}

interface Props {
    groups: AttributeGroup[];
    attributes: AttributeItem[];
    otherFamilies?: AttributeFamilyOption[];
}

export default function AttributeFamilyCreate({ groups, attributes, otherFamilies = [] }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributeFamilies'), href: '/catalog/attributeFamilies' },
        { title: t('createAttributeFamily'), href: '/catalog/attributeFamilies/create' },
    ];

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        group_attributes: [] as { attribute_id: number; attribute_group_id: number }[],
    });

    const [attrSearch, setAttrSearch] = useState('');
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
    const [assignedGroups, setAssignedGroups] = useState<AssignedGroup[]>([]);
    const [unassignedAttrs, setUnassignedAttrs] = useState<AttributeItem[]>(attributes);
    // sourceGroupId: null = ลากมาจากคอลัมน์ "ยังไม่ได้จัดกลุ่ม" (การวางครั้งแรก),
    // ไม่ null = ลากมาจาก group นั้นๆ อยู่แล้ว (ย้ายจาก group เดิมไป group ใหม่ —
    // ต้องรู้ต้นทางเพราะตอนนี้ 1 attribute อยู่ได้หลาย group พร้อมกัน การลากจึง
    // "ย้าย" แค่ตำแหน่งที่ลากมาเท่านั้น ไม่ใช่ล้างออกจากทุก group เหมือนเมื่อก่อน)
    const [draggedAttr, setDraggedAttr] = useState<{ attr: AttributeItem; sourceGroupId: number | null } | null>(null);
    const [noGroupWarningOpen, setNoGroupWarningOpen] = useState(false);
    // เมนู "เพิ่มเข้าอีกกลุ่ม" — เปิดจากปุ่ม + บนแถวแอตทริบิวต์ที่ถูกจัดกลุ่มแล้ว
    // ต่างจากการลาก (ที่ "ย้าย") ตรงที่ปุ่มนี้ "เพิ่มสำเนาตำแหน่ง" โดยไม่เอาออกจาก
    // group เดิมเลย — เป็นทางเดียวที่จะทำให้ 1 attribute อยู่ 2+ group พร้อมกันได้
    const [addToGroupMenu, setAddToGroupMenu] = useState<{ element: HTMLElement; attr: AttributeItem; currentGroupId: number } | null>(null);

    // สลับภาษาแล้ว props มาเป็นชื่อภาษาใหม่ — อัปเดตชื่อใน state ตาม (ดู relabel-assignments.ts)
    useEffect(() => {
        const attributesById = new Map(attributes.map((a) => [a.id, a]));
        const groupsById = new Map(groups.map((g) => [g.id, g]));
        setUnassignedAttrs((prev) => relabelAttributes(prev, attributesById));
        setAssignedGroups((prev) => relabelGroups(prev, groupsById, attributesById));
    }, [attributes, groups]);

    // ข้อมูลการจับคู่กลุ่ม/แอตทริบิวต์ เก็บไว้ใน local state (assignedGroups) ด้านบน
    // ไม่ได้อยู่ใน data ของ useForm ดังนั้นถ้าเช็คแค่ isDirty อย่างเดียวจะจับการเปลี่ยนแปลง
    // ที่เกิดจากการลากวาง (drag-and-drop) ไม่ได้ — เพราะหน้า Create เริ่มจากค่าว่างๆ
    // แค่มีกลุ่มถูกกำหนดขึ้นมา ก็ถือว่าเป็นความคืบหน้าจริงที่เสียไปได้แล้ว
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty || assignedGroups.length > 0);

    // การลาก (หรือคลิก) แอตทริบิวต์จะมีความหมายก็ต่อเมื่อมีกลุ่มให้ตกลงไปแล้วอย่างน้อยหนึ่งกลุ่ม
    // ถ้ายังไม่มีกลุ่มเลยก็ไม่มีที่ให้วาง (คอลัมน์กลุ่มจะโชว์แค่ placeholder ว่างๆ)
    // เลยต้องเตือนผู้ใช้แทนที่จะปล่อยให้ลาก/คลิกแล้วไม่มีอะไรเกิดขึ้นแบบเงียบๆ
    // เพราะแบบนั้นมันดูเหมือนบั๊กมากกว่าจะรู้ว่ายังขาดขั้นตอนอยู่
    const requireGroupBeforeAssigning = (): boolean => {
        if (assignedGroups.length === 0) {
            setNoGroupWarningOpen(true);
            return true;
        }
        return false;
    };

    const filteredUnassigned = unassignedAttrs.filter((attr) => {
        const title = attr.name || attr.code;
        return title.toLowerCase().includes(attrSearch.toLowerCase());
    });

    const toggleGroupExpand = (groupId: number) => {
        setAssignedGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, expanded: !g.expanded } : g)));
    };

    const handleAssignGroup = () => {
        if (selectedGroupIds.length === 0) return;

        const toAdd = selectedGroupIds
            .map((id) => groups.find((g) => g.id === id))
            .filter((g): g is AttributeGroup => Boolean(g))
            .filter((g) => !assignedGroups.some((a) => a.id === g.id))
            .map((g) => ({
                id: g.id,
                code: g.code,
                name: g.name || g.code.charAt(0).toUpperCase() + g.code.slice(1),
                attributes: [] as AttributeItem[],
                expanded: true,
            }));

        if (toAdd.length > 0) {
            setAssignedGroups((prev) => [...prev, ...toAdd]);
        }

        setSelectedGroupIds([]);
        setAssignDialogOpen(false);
    };

    const closeAssignDialog = () => {
        setSelectedGroupIds([]);
        setAssignDialogOpen(false);
    };

    // เฉพาะกลุ่มที่ยังไม่ถูกกำหนด — กันไม่ให้เลือกซ้ำจากใน dropdown
    const assignableGroups = groups.filter((g) => !assignedGroups.some((a) => a.id === g.id));

    // ปุ่ม "ใช้เทมเพลตจาก..." — เลือกตระกูลที่มีอยู่แล้วเป็นต้นแบบ, พรีวิวโครงสร้าง
    // group/attribute ของมันก่อน แล้วค่อย "เพิ่มต่อท้าย" เข้าโครงสร้างที่กำลัง
    // จัดอยู่ตอนนี้ (ยังไม่ได้ save เลยด้วยซ้ำ เพราะหน้านี้คือ Create) — เหมือนกับ
    // ฟีเจอร์เดียวกันในหน้า Edit ทุกประการ
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [templateStep, setTemplateStep] = useState<'pick' | 'preview'>('pick');
    const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
    const [templatePreviewGroups, setTemplatePreviewGroups] = useState<TemplatePreviewGroup[] | null>(null);
    const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);

    const openTemplateDialog = () => {
        setSelectedTemplateId(null);
        setTemplatePreviewGroups(null);
        setTemplateStep('pick');
        setTemplateDialogOpen(true);
    };

    const closeTemplateDialog = () => {
        setTemplateDialogOpen(false);
        setSelectedTemplateId(null);
        setTemplatePreviewGroups(null);
        setTemplateStep('pick');
    };

    const loadTemplatePreview = (templateId: number) => {
        setSelectedTemplateId(templateId);
        setTemplatePreviewLoading(true);
        fetch(`/catalog/attributeFamilies/${templateId}/template-preview`, {
            headers: { Accept: 'application/json' },
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((json: { familyAttributes?: FamilyAttributePivot[] } | null) => {
                const groupsMap = new Map<number, TemplatePreviewGroup>();
                (json?.familyAttributes ?? []).forEach((item) => {
                    const grpId = item.attribute_group_id;
                    if (!groupsMap.has(grpId)) {
                        const grpCode = item.attribute_group?.code || `Group ${grpId}`;
                        groupsMap.set(grpId, {
                            id: grpId,
                            code: grpCode,
                            name: item.attribute_group?.name || grpCode.charAt(0).toUpperCase() + grpCode.slice(1),
                            attributes: [],
                        });
                    }
                    if (item.attribute) {
                        groupsMap.get(grpId)!.attributes.push(item.attribute);
                    }
                });
                setTemplatePreviewGroups(Array.from(groupsMap.values()));
                setTemplateStep('preview');
            })
            .finally(() => setTemplatePreviewLoading(false));
    };

    // "เพิ่มต่อท้าย" โครงสร้าง group/attribute ของเทมเพลตเข้า assignedGroups
    // ปัจจุบัน — group ที่มีอยู่แล้วในหน้านี้ (id ตรงกัน เพราะ group เป็น master
    // กลางใช้ร่วมกันทุกตระกูล) จะได้ attribute ใหม่ที่ยังไม่มีเพิ่มเข้าไป (ไม่ทับ/
    // ไม่ลบของเดิม) ส่วน group ที่ยังไม่เคยมีจะถูกเพิ่มเข้าไปทั้งกลุ่มใหม่ต่อท้าย —
    // attribute ที่ถูกวางไปจะถูกเอาออกจาก Unassigned ด้วย (ถ้ายังไม่เคยถูกจัดกลุ่ม
    // ที่ไหนมาก่อน)
    const applyTemplateStructure = (templateGroups: TemplatePreviewGroup[]) => {
        if (templateGroups.length === 0) {
            closeTemplateDialog();
            return;
        }

        const placedAttributeIds = new Set<number>();
        templateGroups.forEach((tg) => tg.attributes.forEach((a) => placedAttributeIds.add(a.id)));

        setAssignedGroups((prev) => {
            const byId = new Map(prev.map((g) => [g.id, g]));
            const originalOrder = prev.map((g) => g.id);

            templateGroups.forEach((tg) => {
                const existing = byId.get(tg.id);
                if (existing) {
                    const existingAttrIds = new Set(existing.attributes.map((a) => a.id));
                    const toAdd = tg.attributes.filter((a) => !existingAttrIds.has(a.id));
                    if (toAdd.length > 0) {
                        byId.set(tg.id, { ...existing, attributes: [...existing.attributes, ...toAdd] });
                    }
                } else {
                    const groupMeta = groups.find((g) => g.id === tg.id);
                    byId.set(tg.id, {
                        id: tg.id,
                        code: groupMeta?.code || tg.code,
                        name: groupMeta?.name || tg.name,
                        attributes: [...tg.attributes],
                        expanded: true,
                    });
                }
            });

            const newGroupIds = Array.from(byId.keys()).filter((id) => !originalOrder.includes(id));
            return [...originalOrder, ...newGroupIds].map((id) => byId.get(id)!);
        });

        setUnassignedAttrs((prev) => prev.filter((a) => !placedAttributeIds.has(a.id)));
        closeTemplateDialog();
    };

    // การวาง "ครั้งแรก" จากคอลัมน์ Unassigned เข้า group ใดก็ได้ — ตัดออกจาก pool
    // แล้วใส่เข้า group ปลายทางตัวเดียว (ยังไม่มีที่อื่นให้ "ย้ายจาก" เพราะเพิ่ง
    // หยิบมาจาก Unassigned)
    const handlePlaceFromUnassigned = (attr: AttributeItem, targetGroupId: number) => {
        setUnassignedAttrs((prev) => prev.filter((a) => a.id !== attr.id));
        setAssignedGroups((prev) =>
            prev.map((g) =>
                g.id === targetGroupId && !g.attributes.some((a) => a.id === attr.id) ? { ...g, attributes: [...g.attributes, attr] } : g,
            ),
        );
    };

    // ลากแอตทริบิวต์ที่ถูกจัดกลุ่มอยู่แล้ว (sourceGroupId) ไปวางที่ group อื่น —
    // "ย้าย" เฉพาะตำแหน่งที่ลากออกมาเท่านั้น ไม่แตะตำแหน่งอื่นที่ attribute
    // ตัวเดียวกันอาจถูกวางไว้ในอีก group ก็ได้ (ต่างจากพฤติกรรมเดิมที่ล้างออกจาก
    // "ทุก" group ก่อนค่อยใส่ใหม่ที่เดียว)
    const handleMoveAttributeBetweenGroups = (attr: AttributeItem, sourceGroupId: number, targetGroupId: number) => {
        if (sourceGroupId === targetGroupId) return;
        setAssignedGroups((prev) =>
            prev.map((g) => {
                if (g.id === sourceGroupId) {
                    return { ...g, attributes: g.attributes.filter((a) => a.id !== attr.id) };
                }
                if (g.id === targetGroupId && !g.attributes.some((a) => a.id === attr.id)) {
                    return { ...g, attributes: [...g.attributes, attr] };
                }
                return g;
            }),
        );
    };

    // เพิ่ม "อีกตำแหน่ง" ให้ attribute ที่จัดกลุ่มอยู่แล้ว โดยไม่เอาออกจาก group
    // เดิมเลย — ทางเดียวที่จะทำให้ 1 attribute อยู่ได้มากกว่า 1 group พร้อมกัน
    // (เปิดจากปุ่ม + บนแถวแอตทริบิวต์ ดู addToGroupMenu ด้านล่าง)
    const handleAddAttributeToGroup = (attr: AttributeItem, targetGroupId: number) => {
        setAssignedGroups((prev) =>
            prev.map((g) =>
                g.id === targetGroupId && !g.attributes.some((a) => a.id === attr.id) ? { ...g, attributes: [...g.attributes, attr] } : g,
            ),
        );
    };

    // เอาแอตทริบิวต์ออกจาก group ที่ระบุเพียง group เดียว — กลับไป Unassigned
    // ก็ต่อเมื่อนี่คือตำแหน่งสุดท้ายที่เหลืออยู่เท่านั้น (ถ้ายังถูกวางไว้ที่ group
    // อื่นอยู่ ให้ยังคงอยู่ที่นั่นต่อไปตามปกติ ไม่ต้องกลับไป Unassigned)
    const handleRemoveAttributeFromGroup = (attr: AttributeItem, groupId: number) => {
        const stillPlacedElsewhere = assignedGroups.some((g) => g.id !== groupId && g.attributes.some((a) => a.id === attr.id));

        setAssignedGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, attributes: g.attributes.filter((a) => a.id !== attr.id) } : g)));

        if (!stillPlacedElsewhere) {
            setUnassignedAttrs((prev) => (prev.some((a) => a.id === attr.id) ? prev : [...prev, attr]));
        }
    };

    const handleRemoveGroup = (groupId: number) => {
        const groupToRemove = assignedGroups.find((g) => g.id === groupId);
        if (groupToRemove) {
            const remainingGroups = assignedGroups.filter((g) => g.id !== groupId);
            // แอตทริบิวต์ที่ยังมีตำแหน่งเหลืออยู่ใน group อื่น ไม่ต้องกลับไป
            // Unassigned — กลับเฉพาะตัวที่ group นี้เป็นที่อยู่แห่งสุดท้ายจริงๆ
            const orphaned = groupToRemove.attributes.filter((attr) => !remainingGroups.some((g) => g.attributes.some((a) => a.id === attr.id)));
            if (orphaned.length > 0) {
                setUnassignedAttrs((prev) => [...prev, ...orphaned]);
            }
        }
        setAssignedGroups((prev) => prev.filter((g) => g.id !== groupId));
    };

    const handleDeleteAllGroups = () => {
        // ตัด id ซ้ำออกก่อนคืนกลับ Unassigned — attribute ตัวเดียวกันอาจถูกวางไว้
        // มากกว่า 1 group พร้อมกันได้แล้ว ถ้าไม่ตัดซ้ำจะไปโผล่ซ้ำในคอลัมน์ Unassigned
        const seenIds = new Set<number>();
        const allAssigned: AttributeItem[] = [];
        assignedGroups.forEach((g) => {
            g.attributes.forEach((attr) => {
                if (!seenIds.has(attr.id)) {
                    seenIds.add(attr.id);
                    allAssigned.push(attr);
                }
            });
        });
        setUnassignedAttrs((prev) => [...prev, ...allAssigned]);
        setAssignedGroups([]);
    };

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        // กันกด Save ซ้ำๆ ตอน request แรกยังไม่จบ (บั๊กจริงที่เจอ: หน้านี้เคยยิง
        // ผ่าน router.post() ตรงๆ แทนที่จะเป็น post() ของ useForm() เอง ทำให้
        // processing ด้านล่างไม่เคยเปลี่ยนเป็น true จริงๆ เลย — ปุ่ม Save เลย
        // ไม่ disable ระหว่างรอ กดซ้ำได้เรื่อยๆ จนสร้าง attribute family ซ้ำกัน
        // หลายตัว เช็ค processing ตรงนี้ไว้อีกชั้นด้วย เผื่อกด Enter ในช่องกรอก
        // ซ้ำๆ ระหว่างรอ ซึ่ง disabled ของปุ่มเพียงอย่างเดียวกันไม่ได้)
        if (processing) return;

        const groupAttrsPayload: { attribute_id: number; attribute_group_id: number }[] = [];
        assignedGroups.forEach((g) => {
            g.attributes.forEach((attr) => {
                groupAttrsPayload.push({
                    attribute_group_id: g.id,
                    attribute_id: attr.id,
                });
            });
        });

        transform((formData) => ({ ...formData, group_attributes: groupAttrsPayload }));
        skipNavigationGuardRef.current = true;
        post('/catalog/attributeFamilies', {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    // แจ้งเตือน "ยังไม่มีกลุ่ม" ปิดตัวเองอัตโนมัติหลัง 7 วินาที (เหมือน Snackbar autoHideDuration เดิม)
    useEffect(() => {
        if (!noGroupWarningOpen) return undefined;
        const timer = window.setTimeout(() => setNoGroupWarningOpen(false), 7000);
        return () => window.clearTimeout(timer);
    }, [noGroupWarningOpen]);

    const dialogStyle = { width: 'min(444px, calc(100vw - 2rem))' };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createAttributeFamily')} />
            <form onSubmit={submit} className={styles.page}>
                {/* หัวข้อและปุ่มต่างๆ */}
                <div className={styles.header}>
                    <Title level="H3">{t('createAttributeFamily')}</Title>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <Button icon="nav-back" onClick={() => router.visit('/catalog/attributeFamilies')}>
                            {t('back')}
                        </Button>
                        <Button design="Emphasized" icon={processing ? undefined : 'save'} disabled={processing} onClick={() => submit()}>
                            {processing ? t('saving') : t('saveAttributeFamily')}
                        </Button>
                    </div>
                </div>

                <div className={styles.mainGrid}>
                    {/* คอลัมน์ซ้าย: กลุ่มและแอตทริบิวต์ที่ยังไม่ได้จัดกลุ่ม */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div>
                                <Title level="H5">{tNav('attributeGroups')}</Title>
                                <div className={styles.subtitle}>{t('attributeGroupsPanelSubtitle')}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <Button design="Transparent" onClick={handleDeleteAllGroups} style={{ color: 'var(--sapNegativeColor)' }}>
                                    {t('deleteGroup')}
                                </Button>
                                {otherFamilies.length > 0 && <Button onClick={openTemplateDialog}>{t('useTemplateFrom')}</Button>}
                                <Button onClick={() => setAssignDialogOpen(true)}>{t('assignAttributeGroup')}</Button>
                            </div>
                        </div>

                        <div className={styles.columns}>
                            {/* ส่วนคอลัมน์หลัก */}
                            <div>
                                <div className={styles.columnTitle} style={{ marginBottom: '0.75rem' }}>
                                    {t('mainColumn')}
                                </div>

                                <div className={styles.groupScroll}>
                                    {assignedGroups.length === 0 ? (
                                        <div className={styles.emptyGroups}>{t('noGroupsAssignedYet')}</div>
                                    ) : (
                                        <div className={styles.groupStack}>
                                            {assignedGroups.map((group) => (
                                                <div
                                                    key={group.id}
                                                    className={styles.dropZone}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        if (draggedAttr) {
                                                            if (draggedAttr.sourceGroupId === null) {
                                                                handlePlaceFromUnassigned(draggedAttr.attr, group.id);
                                                            } else {
                                                                handleMoveAttributeBetweenGroups(
                                                                    draggedAttr.attr,
                                                                    draggedAttr.sourceGroupId,
                                                                    group.id,
                                                                );
                                                            }
                                                            setDraggedAttr(null);
                                                        }
                                                    }}
                                                >
                                                    {/* หัวข้อกลุ่ม */}
                                                    <div className={styles.groupHeader}>
                                                        <div className={styles.groupToggle} onClick={() => toggleGroupExpand(group.id)}>
                                                            <Icon
                                                                name={group.expanded ? 'slim-arrow-down' : 'slim-arrow-right'}
                                                                className={styles.mutedIcon}
                                                            />
                                                            <Icon name="vertical-grip" className={styles.gripIcon} />
                                                            <Icon
                                                                name="folder-blank"
                                                                className={styles.mutedIcon}
                                                                style={{ marginLeft: '0.25rem' }}
                                                            />
                                                            <span className={styles.groupName}>{group.name}</span>
                                                        </div>
                                                        <Button
                                                            design="Transparent"
                                                            icon="delete"
                                                            tooltip={t('deleteGroup')}
                                                            accessibleName={t('deleteGroup')}
                                                            onClick={() => handleRemoveGroup(group.id)}
                                                            style={{ color: 'var(--sapNegativeColor)' }}
                                                        />
                                                    </div>

                                                    {/* รายการแอตทริบิวต์ในกลุ่ม */}
                                                    {group.expanded && (
                                                        <div className={styles.groupAttrs}>
                                                            {group.attributes.map((attr) => {
                                                                const placedGroupCount = assignedGroups.filter((g) =>
                                                                    g.attributes.some((a) => a.id === attr.id),
                                                                ).length;

                                                                return (
                                                                    <div
                                                                        key={attr.id}
                                                                        draggable
                                                                        onDragStart={() => setDraggedAttr({ attr, sourceGroupId: group.id })}
                                                                        className={styles.attrRow}
                                                                    >
                                                                        <div className={styles.attrLabel}>
                                                                            <Icon name="vertical-grip" className={styles.gripIcon} />
                                                                            <span className={styles.attrName}>{attr.name || attr.code}</span>
                                                                            {placedGroupCount > 1 && (
                                                                                <span
                                                                                    className={styles.multiBadge}
                                                                                    title={t('attributeInMultipleGroups', {
                                                                                        count: placedGroupCount,
                                                                                    })}
                                                                                >
                                                                                    ×{placedGroupCount}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className={styles.attrActions}>
                                                                            <Button
                                                                                design="Transparent"
                                                                                icon="sys-add"
                                                                                tooltip={t('addToAnotherGroup')}
                                                                                accessibleName={t('addToAnotherGroup')}
                                                                                onClick={(e) =>
                                                                                    setAddToGroupMenu({
                                                                                        element: e.currentTarget as HTMLElement,
                                                                                        attr,
                                                                                        currentGroupId: group.id,
                                                                                    })
                                                                                }
                                                                            />
                                                                            <Button
                                                                                design="Transparent"
                                                                                icon="sys-minus"
                                                                                tooltip={t('removeFromThisGroup')}
                                                                                accessibleName={t('removeFromThisGroup')}
                                                                                onClick={() => handleRemoveAttributeFromGroup(attr, group.id)}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                            {group.attributes.length === 0 && (
                                                                <span className={styles.dropHint}>{t('dropAttributeHere')}</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* พื้นที่วางสำหรับแอตทริบิวต์ที่ยังไม่ได้จัดกลุ่ม */}
                            <div>
                                <div className={styles.unassignedHeader}>
                                    <span className={styles.columnTitle}>{t('unassignedAttributes')}</span>
                                    <Input
                                        value={attrSearch}
                                        onInput={(e) => setAttrSearch(e.target.value)}
                                        placeholder={t('search')}
                                        icon={<Icon name="search" />}
                                        style={{ width: '10rem' }}
                                    />
                                </div>
                                <span className={styles.caption} style={{ marginBottom: '0.75rem' }}>
                                    {t('dragAttributeToUnassign')}
                                </span>

                                <div
                                    className={styles.unassignedZone}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggedAttr && draggedAttr.sourceGroupId !== null) {
                                            handleRemoveAttributeFromGroup(draggedAttr.attr, draggedAttr.sourceGroupId);
                                        }
                                        setDraggedAttr(null);
                                    }}
                                >
                                    {filteredUnassigned.map((attr) => (
                                        <div
                                            key={attr.id}
                                            draggable
                                            className={styles.unassignedItem}
                                            onDragStart={(e) => {
                                                if (requireGroupBeforeAssigning()) {
                                                    e.preventDefault();
                                                    return;
                                                }
                                                setDraggedAttr({ attr, sourceGroupId: null });
                                            }}
                                            onClick={() => {
                                                if (requireGroupBeforeAssigning()) return;
                                                handlePlaceFromUnassigned(attr, assignedGroups[0].id);
                                            }}
                                        >
                                            <Icon name="vertical-grip" className={styles.gripIcon} />
                                            <span className={styles.attrName}>{attr.name || attr.code}</span>
                                        </div>
                                    ))}
                                    {filteredUnassigned.length === 0 && <span className={styles.unassignedEmpty}>{t('dropHereToUnassign')}</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* คอลัมน์ขวา: ส่วนข้อมูลทั่วไปและป้ายชื่อ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <LocaleLabelFields
                            title={t('labelTitle')}
                            values={data.translations}
                            onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                        />
                    </div>
                </div>

                {Object.keys(errors).length > 0 && (
                    <MessageStrip design="Negative" hideCloseButton style={{ marginTop: '1.5rem' }}>
                        {t('correctHighlightedFields')}
                    </MessageStrip>
                )}
            </form>

            {/* ไดอะล็อกสำหรับกำหนดกลุ่มแอตทริบิวต์ */}
            <Dialog
                open={assignDialogOpen}
                onClose={closeAssignDialog}
                style={dialogStyle}
                header={
                    <Bar
                        startContent={<Title level="H5">{t('assignAttributeGroup')}</Title>}
                        endContent={
                            <Button
                                design="Transparent"
                                icon="decline"
                                tooltip={t('close')}
                                accessibleName={t('close')}
                                onClick={closeAssignDialog}
                            />
                        }
                    />
                }
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <Button design="Emphasized" onClick={handleAssignGroup} disabled={selectedGroupIds.length === 0}>
                                {t('assignAttributeGroup')}
                            </Button>
                        }
                    />
                }
            >
                <div className={styles.dialogBody}>
                    <Label required showColon={false}>
                        {t('groupsRequired')}
                    </Label>
                    <MultiComboBox
                        style={{ width: '100%' }}
                        placeholder={assignableGroups.length === 0 ? t('noAttributeGroupsAvailable') : t('selectOption')}
                        disabled={assignableGroups.length === 0}
                        selectedValues={selectedGroupIds.map(String)}
                        onSelectionChange={(e) =>
                            setSelectedGroupIds(
                                e.detail.items.map((item) => Number((item as unknown as { value?: string }).value)).filter((id) => !Number.isNaN(id)),
                            )
                        }
                    >
                        {assignableGroups.map((grp) => (
                            <MultiComboBoxItem key={grp.id} value={String(grp.id)} text={grp.name || grp.code} />
                        ))}
                    </MultiComboBox>
                </div>
            </Dialog>

            {/* ไดอะล็อก "ใช้เทมเพลตจาก..." — 2 ขั้นตอน: เลือกตระกูลต้นแบบ แล้วพรีวิว
            โครงสร้างของมันก่อนกดยืนยัน (เหมือนกับหน้า Edit ทุกประการ) */}
            <Dialog
                open={templateDialogOpen}
                onClose={closeTemplateDialog}
                style={dialogStyle}
                header={
                    <Bar
                        startContent={<Title level="H5">{t('useTemplateFrom')}</Title>}
                        endContent={
                            <Button
                                design="Transparent"
                                icon="decline"
                                tooltip={t('close')}
                                accessibleName={t('close')}
                                onClick={closeTemplateDialog}
                            />
                        }
                    />
                }
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <>
                                {templateStep === 'preview' && (
                                    <Button design="Transparent" onClick={() => setTemplateStep('pick')}>
                                        {t('back')}
                                    </Button>
                                )}
                                <Button
                                    design="Emphasized"
                                    onClick={() => applyTemplateStructure(templatePreviewGroups ?? [])}
                                    disabled={templateStep !== 'preview' || (templatePreviewGroups?.length ?? 0) === 0}
                                >
                                    {t('useTemplateFromApply')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                {templateStep === 'pick' && (
                    <div className={styles.dialogBody}>
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('useTemplateFromHelp')}</Text>
                        <div className={styles.templateList}>
                            {otherFamilies.map((fam) => (
                                <button key={fam.id} type="button" className={styles.templateItem} onClick={() => loadTemplatePreview(fam.id)}>
                                    <span>
                                        <span className={styles.templateItemName}>{fam.name || fam.code}</span>
                                        <span className={styles.caption}>{fam.code}</span>
                                    </span>
                                    {templatePreviewLoading && selectedTemplateId === fam.id && <BusyIndicator active size="S" />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {templateStep === 'preview' && (
                    <div className={styles.dialogBody}>
                        <Text style={{ color: 'var(--sapContent_LabelColor)' }}>
                            {t('useTemplateFromPreviewHelp', {
                                name:
                                    otherFamilies.find((f) => f.id === selectedTemplateId)?.name ||
                                    otherFamilies.find((f) => f.id === selectedTemplateId)?.code ||
                                    '',
                            })}
                        </Text>
                        {(templatePreviewGroups?.length ?? 0) === 0 ? (
                            <Text style={{ color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>{t('useTemplateFromEmpty')}</Text>
                        ) : (
                            <div className={styles.templateList} style={{ gap: '0.75rem' }}>
                                {templatePreviewGroups!.map((g) => (
                                    <div key={g.id} className={styles.previewGroup}>
                                        <div className={styles.previewGroupName}>{g.name}</div>
                                        <div className={styles.chipRow}>
                                            {g.attributes.map((attr) => (
                                                <span key={attr.id} className={styles.chip}>
                                                    {attr.name || attr.code}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Dialog>

            {noGroupWarningOpen && (
                <MessageStrip design="Critical" className={styles.warningToast} onClose={() => setNoGroupWarningOpen(false)}>
                    <div className={styles.warningToastBody}>
                        <span>{t('noAttributeGroupsWarning')}</span>
                        <Button
                            design="Transparent"
                            onClick={() => {
                                setNoGroupWarningOpen(false);
                                setAssignDialogOpen(true);
                            }}
                        >
                            {t('assignAttributeGroup')}
                        </Button>
                    </div>
                </MessageStrip>
            )}

            {/* เมนู "เพิ่มเข้าอีกกลุ่ม" — เปิดจากปุ่ม + บนแถวแอตทริบิวต์ที่ถูกจัดกลุ่ม
                แล้ว โชว์เฉพาะกลุ่มที่ attribute ตัวนี้ "ยังไม่ได้" อยู่ (กันเพิ่มซ้ำ) */}
            <Menu
                opener={addToGroupMenu?.element ?? null}
                open={Boolean(addToGroupMenu)}
                onClose={() => setAddToGroupMenu(null)}
                onItemClick={(e) => {
                    const groupId = Number((e.detail.item as unknown as HTMLElement).dataset.groupId);
                    if (addToGroupMenu && !Number.isNaN(groupId)) {
                        handleAddAttributeToGroup(addToGroupMenu.attr, groupId);
                    }
                    setAddToGroupMenu(null);
                }}
            >
                {addToGroupMenu &&
                    (() => {
                        const otherGroups = assignedGroups.filter(
                            (g) => g.id !== addToGroupMenu.currentGroupId && !g.attributes.some((a) => a.id === addToGroupMenu.attr.id),
                        );

                        if (otherGroups.length === 0) {
                            return <MenuItem disabled text={t('noOtherGroupsAvailable')} />;
                        }

                        return otherGroups.map((g) => <MenuItem key={g.id} data-group-id={g.id} text={g.name} />);
                    })()}
            </Menu>
        </AppLayout>
    );
}
