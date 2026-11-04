import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriFormErrorSummary, FioriMessageStrip, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useFioriConfirm } from '@/components/fiori-message-box';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/folder-blank.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/navigation-down-arrow.js';
import '@ui5/webcomponents-icons/dist/navigation-right-arrow.js';
import '@ui5/webcomponents-icons/dist/overflow.js';
import '@ui5/webcomponents-icons/dist/save.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/sys-add.js';
import '@ui5/webcomponents-icons/dist/sys-minus.js';
import '@ui5/webcomponents-icons/dist/vertical-grip.js';
import {
    Bar,
    BusyIndicator,
    Button,
    CheckBox,
    Dialog,
    Icon,
    Input,
    Label,
    Menu,
    MenuItem,
    MultiComboBox,
    MultiComboBoxItem,
    Tab,
    TabContainer,
    Title,
} from '@ui5/webcomponents-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './edit.module.css';
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

interface AttributeFamily {
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

interface AssignedGroup {
    id: number;
    code: string;
    name: string;
    attributes: AttributeItem[];
    expanded: boolean;
}

interface Props {
    family: AttributeFamily;
    translations: Record<string, string>;
    groups: AttributeGroup[];
    attributes: AttributeItem[];
    familyAttributes?: FamilyAttributePivot[];
    otherFamilies?: AttributeFamily[];
    canViewHistory?: boolean;
    canAssignDefaultFamily?: boolean;
    canEditCode?: boolean;
    codeLocked?: boolean;
}

interface TemplatePreviewGroup {
    id: number;
    code: string;
    name: string;
    attributes: AttributeItem[];
}

interface ProductGroupPickerItem {
    id: number;
    name: string;
    subcategory_name: string | null;
    category_name: string | null;
    is_default: boolean;
}

interface ProductGroupPickerResponse {
    data: ProductGroupPickerItem[];
    current_page: number;
    last_page: number;
    total: number;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTE FAMILIES', href: '/catalog/attributeFamilies' },
    { title: 'EDIT ATTRIBUTE FAMILY', href: '#' },
];

export default function AttributeFamilyEdit({
    family,
    translations,
    groups,
    attributes,
    familyAttributes = [],
    otherFamilies = [],
    canViewHistory = false,
    canAssignDefaultFamily = false,
    canEditCode = false,
    codeLocked = false,
}: Props) {
    const { t } = useTranslation('catalog');
    const [tabIndex, setTabIndex] = useState(0);
    const { data, setData, put, transform, processing, errors, isDirty } = useForm({
        code: family.code || '',
        translations: translations || {},
    });

    // Fiori Message Box แทน window.confirm() ของเบราว์เซอร์ (ดู
    // setAsDefaultForAllGroups() ด้านล่าง) — {confirmElement} ต้อง render ไว้ใน
    // ต้นไม้ JSX ของหน้านี้ด้วย
    const { confirm, confirmElement } = useFioriConfirm();

    const [attrSearch, setAttrSearch] = useState('');
    // ค้นหาแอตทริบิวต์ในคอลัมน์หลัก (กลุ่มที่จัดไว้แล้ว) — คนละช่องกับ attrSearch
    // ของคอลัมน์ Unassigned
    const [groupAttrSearch, setGroupAttrSearch] = useState('');
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
    const [assignedGroups, setAssignedGroups] = useState<AssignedGroup[]>([]);
    const [unassignedAttrs, setUnassignedAttrs] = useState<AttributeItem[]>([]);
    // sourceGroupId: null = ลากมาจากคอลัมน์ "ยังไม่ได้จัดกลุ่ม" (การวางครั้งแรก),
    // ไม่ null = ลากมาจาก group นั้นๆ อยู่แล้ว (ย้าย/จัดเรียงใหม่ — ต้องรู้ต้นทาง
    // เพราะตอนนี้ 1 attribute อยู่ได้หลาย group พร้อมกัน การลากจึง "ย้าย" แค่
    // ตำแหน่งที่ลากมาเท่านั้น ไม่ใช่ล้างออกจากทุก group เหมือนเมื่อก่อน)
    const [draggedAttr, setDraggedAttr] = useState<{ attr: AttributeItem; sourceGroupId: number | null } | null>(null);
    const [draggedGroupId, setDraggedGroupId] = useState<number | null>(null);
    const [noGroupWarningOpen, setNoGroupWarningOpen] = useState(false);
    // เมนู "เพิ่มเข้าอีกกลุ่ม" — เปิดจากปุ่ม + บนแถวแอตทริบิวต์ที่ถูกจัดกลุ่มแล้ว
    // ต่างจากการลาก (ที่ "ย้าย"/"จัดเรียงใหม่") ตรงที่ปุ่มนี้ "เพิ่มสำเนาตำแหน่ง"
    // โดยไม่เอาออกจาก group เดิมเลย — เป็นทางเดียวที่จะทำให้ 1 attribute อยู่
    // 2+ group พร้อมกันได้
    const [addToGroupMenu, setAddToGroupMenu] = useState<{ element: HTMLElement; attr: AttributeItem; currentGroupId: number } | null>(null);
    // assignedGroups/unassignedAttrs เริ่มต้นมาพร้อมข้อมูลจาก familyAttributes อยู่แล้ว
    // (ดู effect ด้านล่าง) ดังนั้นแค่เช็คว่า "ไม่ว่าง" จะเอามาบอกว่ามีการแก้ไขแบบหน้า Create
    // ไม่ได้ — ตัวแปรนี้จะกลายเป็น true ก็ต่อเมื่อมีการเรียก handler ที่จัดการกลุ่ม
    // จริงๆ จนไปแก้ไขการจัดเรียงนั้น
    const [groupsDirty, setGroupsDirty] = useState(false);
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty || groupsDirty);

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

    // อ่านผ่าน ref เพื่อไม่ให้ effect ด้านล่าง re-run แค่เพราะ groupsDirty เปลี่ยน
    const groupsDirtyRef = useRef(groupsDirty);
    groupsDirtyRef.current = groupsDirty;

    useEffect(() => {
        // props เปลี่ยนระหว่างที่ผู้ใช้จัดกลุ่มค้างไว้ (เช่น สลับภาษา → router.reload())
        // ห้ามสร้างใหม่จาก DB ไม่งั้นการลากที่ยังไม่บันทึกหายหมด — แค่อัปเดตชื่อตาม id
        if (groupsDirtyRef.current) {
            const attributesById = new Map(attributes.map((a) => [a.id, a]));
            const groupsById = new Map(groups.map((g) => [g.id, g]));
            setUnassignedAttrs((prev) => relabelAttributes(prev, attributesById));
            setAssignedGroups((prev) => relabelGroups(prev, groupsById, attributesById));
            return;
        }

        // สร้าง assignedGroups และ unassignedAttrs จากข้อมูลจริงใน DB (familyAttributes กับ attributes props)
        // familyAttributes มาจาก backend เรียงตาม sort_order แล้ว — ต้องใช้ Map เพื่อ
        // รักษาลำดับ "กลุ่มที่เจอก่อน" ไว้ตามนั้น ถ้าใช้ object ธรรมดา Object.values()
        // จะเรียง key ที่เป็นตัวเลข (group id) ใหม่จากน้อยไปมากเสมอ ทำให้การจัดเรียง
        // กลุ่มที่ผู้ใช้บันทึกไว้หายไปทุกครั้งที่กลับเข้าหน้านี้
        const groupsMap = new Map<number, AssignedGroup>();
        const assignedAttrIds = new Set<number>();

        familyAttributes.forEach((item) => {
            const grpId = item.attribute_group_id;
            const grpCode = item.attribute_group?.code || `Group ${grpId}`;
            const grpName = item.attribute_group?.name || grpCode.charAt(0).toUpperCase() + grpCode.slice(1);

            if (!groupsMap.has(grpId)) {
                groupsMap.set(grpId, {
                    id: grpId,
                    code: grpCode,
                    name: grpName,
                    attributes: [],
                    expanded: true,
                });
            }

            if (item.attribute) {
                groupsMap.get(grpId)!.attributes.push(item.attribute);
                assignedAttrIds.add(item.attribute.id);
            }
        });

        setAssignedGroups(Array.from(groupsMap.values()));
        setUnassignedAttrs(attributes.filter((a) => !assignedAttrIds.has(a.id)));
    }, [familyAttributes, attributes, groups]);

    const filteredUnassigned = unassignedAttrs.filter((attr) => {
        const title = attr.name || attr.code;
        return title.toLowerCase().includes(attrSearch.toLowerCase());
    });

    const groupQuery = groupAttrSearch.trim().toLowerCase();
    const matchesGroupQuery = (attr: AttributeItem) => (attr.name || attr.code).toLowerCase().includes(groupQuery);
    // เมื่อมีคำค้น: กลุ่มที่ยังมีแอตทริบิวต์ตรงกันอย่างน้อยหนึ่งตัว
    const groupSearchHasResults = !groupQuery || assignedGroups.some((g) => g.attributes.some(matchesGroupQuery));

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
            setGroupsDirty(true);
            setAssignedGroups((prev) => [...prev, ...toAdd]);
        }

        setSelectedGroupIds([]);
        setAssignDialogOpen(false);
    };

    const closeAssignDialog = () => {
        setSelectedGroupIds([]);
        setAssignDialogOpen(false);
    };

    // เฉพาะกลุ่มที่ยังไม่ถูกกำหนดให้ family นี้ — กันไม่ให้เลือกซ้ำจากใน dropdown
    const assignableGroups = groups.filter((g) => !assignedGroups.some((a) => a.id === g.id));

    // ปุ่ม "ใช้เทมเพลตจาก..." — เลือกตระกูลอื่นเป็นต้นแบบ, พรีวิวโครงสร้าง
    // group/attribute ของมันก่อน แล้วค่อย "เพิ่มต่อท้าย" (merge) เข้าโครงสร้าง
    // ปัจจุบันที่ยังไม่ได้ save (ไม่ล้าง/ไม่ทับของเดิม) — ผู้ใช้ยังต้องกด
    // "Save Attribute Family" เองอีกทีถึงจะ persist จริง เหมือน handler อื่นๆ
    // ในไฟล์นี้ที่แก้แค่ local state ก่อนเสมอ
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
    // ไม่ลบของเดิม) ส่วน group ที่ยังไม่เคยมีในตระกูลนี้จะถูกเพิ่มเข้าไปทั้งกลุ่มใหม่
    // ต่อท้ายลิสต์ — attribute ที่ถูกวางไปจะถูกเอาออกจาก Unassigned ด้วย (ถ้ายัง
    // ไม่เคยถูกจัดกลุ่มที่ไหนมาก่อนในตระกูลนี้)
    const applyTemplateStructure = (templateGroups: TemplatePreviewGroup[]) => {
        if (templateGroups.length === 0) {
            closeTemplateDialog();
            return;
        }

        setGroupsDirty(true);

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

    // ฟังก์ชันนี้จัดการทั้งกรณี "วางครั้งแรกจาก Unassigned" (sourceGroupId ===
    // null, ไม่ส่ง targetIndex มา -> เพิ่มต่อท้ายให้), "ย้ายจาก group หนึ่งไปอีก
    // group หนึ่ง" (sourceGroupId ต่างจาก targetGroupId — เอาออกจาก source
    // เดียว ไม่แตะตำแหน่งอื่นที่ attribute ตัวเดียวกันอาจถูกวางไว้ในอีก group),
    // และ "จัดเรียงใหม่ภายใน group เดียวกัน" (sourceGroupId === targetGroupId,
    // ลากไปวางทับแอตทริบิวต์ตัวอื่นในกลุ่มเดิม) — ต่างจากพฤติกรรมเดิมที่ล้าง
    // attribute ออกจาก "ทุก" group ก่อนเสมอ (ซึ่งจะทำลายตำแหน่งอื่นที่ตั้งใจ
    // วางไว้คู่ขนานกันไปด้วย)
    const handlePlaceOrMoveAttribute = (attr: AttributeItem, sourceGroupId: number | null, targetGroupId: number, targetIndex?: number) => {
        setGroupsDirty(true);

        if (sourceGroupId === null) {
            setUnassignedAttrs((prev) => prev.filter((a) => a.id !== attr.id));
        }

        setAssignedGroups((prev) =>
            prev.map((g) => {
                if (g.id === targetGroupId) {
                    const cleanAttrs = g.attributes.filter((a) => a.id !== attr.id);
                    const insertAt = targetIndex === undefined ? cleanAttrs.length : Math.min(targetIndex, cleanAttrs.length);
                    return { ...g, attributes: [...cleanAttrs.slice(0, insertAt), attr, ...cleanAttrs.slice(insertAt)] };
                }
                if (g.id === sourceGroupId) {
                    return { ...g, attributes: g.attributes.filter((a) => a.id !== attr.id) };
                }
                return g;
            }),
        );
    };

    // เพิ่ม "อีกตำแหน่ง" ให้ attribute ที่จัดกลุ่มอยู่แล้ว โดยไม่เอาออกจาก group
    // เดิมเลย — ทางเดียวที่จะทำให้ 1 attribute อยู่ได้มากกว่า 1 group พร้อมกัน
    // (เปิดจากปุ่ม + บนแถวแอตทริบิวต์ ดู addToGroupMenu ด้านล่าง)
    const handleAddAttributeToGroup = (attr: AttributeItem, targetGroupId: number) => {
        setGroupsDirty(true);
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
        setGroupsDirty(true);
        const stillPlacedElsewhere = assignedGroups.some((g) => g.id !== groupId && g.attributes.some((a) => a.id === attr.id));

        setAssignedGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, attributes: g.attributes.filter((a) => a.id !== attr.id) } : g)));

        if (!stillPlacedElsewhere) {
            setUnassignedAttrs((prev) => (prev.some((a) => a.id === attr.id) ? prev : [...prev, attr]));
        }
    };

    // ย้ายกลุ่มที่ลากไปแทนที่ตำแหน่งของกลุ่มเป้าหมายที่วาง (ลำดับใน array ตรงนี้
    // คือสิ่งที่ submit() จะแปลงเป็น sort_order เลย ดังนั้นนี่คือกลไกทั้งหมด
    // ไม่มีฟิลด์ "ลำดับกลุ่ม" แยกต่างหากให้ต้องคอย sync กันอีก)
    const handleReorderGroup = (sourceGroupId: number, targetGroupId: number) => {
        if (sourceGroupId === targetGroupId) return;

        setGroupsDirty(true);
        setAssignedGroups((prev) => {
            const sourceIndex = prev.findIndex((g) => g.id === sourceGroupId);
            const targetIndex = prev.findIndex((g) => g.id === targetGroupId);
            if (sourceIndex === -1 || targetIndex === -1) return prev;

            const next = [...prev];
            const [moved] = next.splice(sourceIndex, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
    };

    const handleRemoveGroup = (groupId: number) => {
        setGroupsDirty(true);
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
        setGroupsDirty(true);
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
        if (e) e.preventDefault();
        // กันกด Save ซ้ำๆ ตอน request แรกยังไม่จบ (บั๊กจริงที่เจอ: หน้านี้เคยยิง
        // ผ่าน router.put() ตรงๆ แทนที่จะเป็น put() ของ useForm() เอง ทำให้
        // processing ด้านล่างไม่เคยเปลี่ยนเป็น true จริงๆ เลย — ปุ่ม Save เลย
        // ไม่ disable ระหว่างรอ กดซ้ำได้เรื่อยๆ เช็ค processing ตรงนี้ไว้อีกชั้น
        // ด้วย เผื่อกด Enter ในช่องกรอกซ้ำๆ ระหว่างรอ ซึ่ง disabled ของปุ่ม
        // เพียงอย่างเดียวกันไม่ได้)
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
        put(`/catalog/attributeFamilies/${family.id}`, {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    // modal "Options" (ปุ่ม ⋯ ที่หัวหน้า) — ปิด modal ก่อนแล้วค่อยรัน action
    // เพราะ action ถัดไปจะเปิด confirm / dialog เลือกกลุ่มซ้อนขึ้นมาอีกชั้น
    const [optionsDialogOpen, setOptionsDialogOpen] = useState(false);
    const runOption = (action: () => void) => {
        setOptionsDialogOpen(false);
        action();
    };

    const [settingDefault, setSettingDefault] = useState(false);
    const setAsDefaultForAllGroups = async () => {
        const confirmed = await confirm({
            title: t('setDefaultForAllGroups'),
            message: t('setDefaultForAllGroupsConfirm', { name: family.name || family.code }),
            severity: 'warning',
        });
        if (!confirmed) return;

        setSettingDefault(true);
        router.post(
            `/catalog/attributeFamilies/${family.id}/set-default-for-all-groups`,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setSettingDefault(false),
            },
        );
    };

    // "กำหนดค่าเริ่มต้นบางกลุ่มสินค้า" — คู่หูของปุ่ม "ทุกกลุ่มสินค้า" ด้านบน แต่
    // เลือกทีละกลุ่มผ่าน dialog ค้นหา/แบ่งหน้าได้ (มีกลุ่มสินค้าในระบบหลักร้อยตัว
    // — โหลดมาทั้งหมดในหน้าเดียวไม่ไหว ต้องยิง fetch() ไปเซิร์ฟเวอร์ทีละหน้า
    // เหมือนหน้า Product Groups เอง) selectedProductGroupIds เก็บไว้แยกจากหน้า
    // ที่กำลังโชว์ตอนนี้ ให้ค้นหา/เปลี่ยนหน้าไปมาได้โดยไม่ลืมตัวที่ติ๊กไว้จากหน้าอื่น
    // (ตั้งชื่อแยกจาก selectedGroupIds ด้านบน — ตัวนั้นคือ "Assign Attribute
    // Group" dialog คนละเรื่องกันเลย ชื่อบังเอิญคล้ายกันเฉยๆ)
    const [selectGroupsDialogOpen, setSelectGroupsDialogOpen] = useState(false);
    const [groupPickerSearch, setGroupPickerSearch] = useState('');
    const [groupPickerPage, setGroupPickerPage] = useState(1);
    const [groupPickerData, setGroupPickerData] = useState<ProductGroupPickerResponse | null>(null);
    const [groupPickerLoading, setGroupPickerLoading] = useState(false);
    const [selectedProductGroupIds, setSelectedProductGroupIds] = useState<Set<number>>(new Set());
    const [applyingSelectedGroups, setApplyingSelectedGroups] = useState(false);

    useEffect(() => {
        if (!selectGroupsDialogOpen) return undefined;

        setGroupPickerLoading(true);
        const params = new URLSearchParams({ page: String(groupPickerPage), per_page: '15' });
        if (groupPickerSearch.trim()) params.set('search', groupPickerSearch.trim());

        const controller = new AbortController();
        fetch(`/catalog/attributeFamilies/${family.id}/product-groups-for-default-picker?${params}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => res.json())
            .then((json: ProductGroupPickerResponse) => setGroupPickerData(json))
            .catch((err) => {
                if (err.name !== 'AbortError') setGroupPickerData(null);
            })
            .finally(() => setGroupPickerLoading(false));

        return () => controller.abort();
    }, [selectGroupsDialogOpen, groupPickerSearch, groupPickerPage, family.id]);

    // ค้นหาใหม่ -> กลับไปหน้า 1 เสมอ (หน้าเดิมอาจไม่มีอยู่แล้วในผลลัพธ์ใหม่)
    useEffect(() => {
        setGroupPickerPage(1);
    }, [groupPickerSearch]);

    const toggleGroupSelected = (groupId: number) => {
        setSelectedProductGroupIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    };

    const closeSelectGroupsDialog = () => {
        setSelectGroupsDialogOpen(false);
        setGroupPickerSearch('');
        setGroupPickerPage(1);
        setGroupPickerData(null);
        setSelectedProductGroupIds(new Set());
    };

    const applySelectedGroups = () => {
        if (selectedProductGroupIds.size === 0 || applyingSelectedGroups) return;

        setApplyingSelectedGroups(true);
        router.post(
            `/catalog/attributeFamilies/${family.id}/set-default-for-groups`,
            { category_ids: Array.from(selectedProductGroupIds) },
            {
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => closeSelectGroupsDialog(),
                onFinish: () => setApplyingSelectedGroups(false),
            },
        );
    };

    // "ยกเลิกตั้งตระกูลให้ทุกกลุ่มสินค้า" / "ยกเลิกให้บางกลุ่มสินค้า" — ทิศทางตรงข้าม
    // ของสองบล็อกด้านบน ถอด family นี้ออกจากกลุ่มสินค้าที่ผูกอยู่แทนที่จะตั้งเป็น
    // default ให้ ใช้ endpoint/สิทธิ์คนละชุดกับด้านบน เลยแยก state ของตัวเอง
    // ไม่ปนกับ selectGroupsDialogOpen ด้านบน
    const [unassigningAll, setUnassigningAll] = useState(false);
    const unassignFromAllGroups = async () => {
        const confirmed = await confirm({
            title: t('unsetDefaultForAllGroups'),
            message: t('unsetDefaultForAllGroupsConfirm', { name: family.name || family.code }),
            severity: 'warning',
        });
        if (!confirmed) return;

        setUnassigningAll(true);
        router.post(
            `/catalog/attributeFamilies/${family.id}/unset-default-for-all-groups`,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setUnassigningAll(false),
            },
        );
    };

    const [unassignDialogOpen, setUnassignDialogOpen] = useState(false);
    const [unassignPickerSearch, setUnassignPickerSearch] = useState('');
    const [unassignPickerPage, setUnassignPickerPage] = useState(1);
    const [unassignPickerData, setUnassignPickerData] = useState<ProductGroupPickerResponse | null>(null);
    const [unassignPickerLoading, setUnassignPickerLoading] = useState(false);
    const [selectedUnassignGroupIds, setSelectedUnassignGroupIds] = useState<Set<number>>(new Set());
    const [applyingUnassignGroups, setApplyingUnassignGroups] = useState(false);
    const [selectAllUnassignLoading, setSelectAllUnassignLoading] = useState(false);

    useEffect(() => {
        if (!unassignDialogOpen) return undefined;

        setUnassignPickerLoading(true);
        const params = new URLSearchParams({ page: String(unassignPickerPage), per_page: '15' });
        if (unassignPickerSearch.trim()) params.set('search', unassignPickerSearch.trim());

        const controller = new AbortController();
        fetch(`/catalog/attributeFamilies/${family.id}/product-groups-for-unassign-picker?${params}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => res.json())
            .then((json: ProductGroupPickerResponse) => setUnassignPickerData(json))
            .catch((err) => {
                if (err.name !== 'AbortError') setUnassignPickerData(null);
            })
            .finally(() => setUnassignPickerLoading(false));

        return () => controller.abort();
    }, [unassignDialogOpen, unassignPickerSearch, unassignPickerPage, family.id]);

    useEffect(() => {
        setUnassignPickerPage(1);
    }, [unassignPickerSearch]);

    const toggleUnassignGroupSelected = (groupId: number) => {
        setSelectedUnassignGroupIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    };

    // ดึง id ของกลุ่มสินค้าที่ผูกกับตระกูลนี้อยู่ตรงกับคำค้นปัจจุบัน "ทุกหน้า" มา
    // เลือกทีเดียว (เหมือน selectAllMatching ของ BulkGenerateDialog) — union
    // เข้ากับตัวที่เลือกไว้ก่อนหน้า ไม่ทับของเดิม
    const selectAllUnassignMatching = () => {
        if (selectAllUnassignLoading) return;

        setSelectAllUnassignLoading(true);
        const params = new URLSearchParams();
        if (unassignPickerSearch.trim()) params.set('search', unassignPickerSearch.trim());

        fetch(`/catalog/attributeFamilies/${family.id}/product-groups-for-unassign-picker/ids?${params}`, {
            headers: { Accept: 'application/json' },
        })
            .then((res) => res.json())
            .then((json: { ids: number[] }) => {
                setSelectedUnassignGroupIds((prev) => new Set([...prev, ...json.ids]));
            })
            .finally(() => setSelectAllUnassignLoading(false));
    };

    const clearUnassignSelection = () => setSelectedUnassignGroupIds(new Set());

    const closeUnassignDialog = () => {
        setUnassignDialogOpen(false);
        setUnassignPickerSearch('');
        setUnassignPickerPage(1);
        setUnassignPickerData(null);
        setSelectedUnassignGroupIds(new Set());
    };

    const applyUnassignGroups = () => {
        if (selectedUnassignGroupIds.size === 0 || applyingUnassignGroups) return;

        setApplyingUnassignGroups(true);
        router.post(
            `/catalog/attributeFamilies/${family.id}/unset-default-for-groups`,
            { category_ids: Array.from(selectedUnassignGroupIds) },
            {
                preserveScroll: true,
                preserveState: true,
                onSuccess: () => closeUnassignDialog(),
                onFinish: () => setApplyingUnassignGroups(false),
            },
        );
    };

    // เดิม MUI <Snackbar autoHideDuration={7000}> — ซ่อนแถบเตือนเองหลัง 7 วินาที
    useEffect(() => {
        if (!noGroupWarningOpen) return undefined;
        const timer = window.setTimeout(() => setNoGroupWarningOpen(false), 7000);
        return () => window.clearTimeout(timer);
    }, [noGroupWarningOpen]);

    // หัว dialog แบบ Fiori: ชื่อซ้ายและปุ่มปิด (×) ขวา — แทน DialogTitle + IconButton เดิม
    const dialogHeader = (title: string, onClose: () => void) => (
        <Bar
            className={styles.dialogBar}
            startContent={<Title level="H5">{title}</Title>}
            endContent={<Button design="Transparent" icon="decline" tooltip={t('close')} accessibleName={t('close')} onClick={onClose} />}
        />
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Attribute Family: ${family.code}`} />
            <form onSubmit={submit} className={styles.page}>
                {canViewHistory && (
                    <TabContainer collapsed onTabSelect={(e) => setTabIndex(e.detail.tabIndex)} style={{ marginBottom: '1.5rem' }}>
                        <Tab text="General" selected={tabIndex === 0} />
                        <Tab text="History" selected={tabIndex === 1} />
                    </TabContainer>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/attributeFamilies/${family.id}/history`} />}

                {tabIndex === 0 && (
                    <>
                        {/* หัวข้อและปุ่มต่างๆ */}
                        <div className={styles.header}>
                            <Title level="H3">Edit Attribute Family</Title>
                            <div className={styles.headerActions}>
                                <Button icon="overflow" onClick={() => setOptionsDialogOpen(true)}>
                                    {t('familyOptions')}
                                </Button>
                                <Button icon="nav-back" onClick={() => router.visit('/catalog/attributeFamilies')}>
                                    Back
                                </Button>
                                <Button design="Emphasized" icon="save" disabled={processing} loading={processing} onClick={() => submit()}>
                                    {processing ? 'Saving…' : 'Save Attribute Family'}
                                </Button>
                            </div>
                        </div>

                        <div className={styles.mainGrid}>
                            {/* คอลัมน์ซ้าย: กลุ่มและแอตทริบิวต์ที่ยังไม่ได้จัดกลุ่ม */}
                            <div className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <Title level="H5">Attribute Groups</Title>
                                        <span className={styles.subtitle}>Manage attribute family groups</span>
                                    </div>
                                    <div className={styles.headerActions}>
                                        <Button design="Transparent" style={{ color: 'var(--sapNegativeTextColor)' }} onClick={handleDeleteAllGroups}>
                                            Delete Group
                                        </Button>
                                        {otherFamilies.length > 0 && <Button onClick={openTemplateDialog}>{t('useTemplateFrom')}</Button>}
                                        <Button onClick={() => setAssignDialogOpen(true)}>{t('assignAttributeGroup')}</Button>
                                    </div>
                                </div>

                                <div className={styles.columns}>
                                    {/* ส่วนคอลัมน์หลัก */}
                                    <div>
                                        <div className={styles.unassignedHeader} style={{ marginBottom: '0.75rem' }}>
                                            <span className={styles.columnTitle}>Main Column</span>
                                            <Input
                                                value={groupAttrSearch}
                                                onInput={(e) => setGroupAttrSearch(e.target.value)}
                                                placeholder="Search"
                                                icon={<Icon name="search" />}
                                                className={styles.searchInput}
                                            />
                                        </div>

                                        <div className={styles.groupScroll}>
                                            {assignedGroups.length === 0 ? (
                                                <div className={styles.emptyGroups}>{t('noGroupsAssignedYet')}</div>
                                            ) : !groupSearchHasResults ? (
                                                <div className={styles.emptyGroups}>No attributes match “{groupAttrSearch.trim()}”.</div>
                                            ) : (
                                                <div className={styles.groupStack}>
                                                    {assignedGroups.map((group) => {
                                                        const visibleAttrs = groupQuery
                                                            ? group.attributes.filter(matchesGroupQuery)
                                                            : group.attributes;
                                                        if (groupQuery && visibleAttrs.length === 0) return null;
                                                        const isExpanded = groupQuery ? true : group.expanded;
                                                        return (
                                                            <div
                                                                key={group.id}
                                                                className={styles.dropZone}
                                                                onDragOver={(e) => e.preventDefault()}
                                                                onDrop={(e) => {
                                                                    e.preventDefault();
                                                                    if (draggedGroupId !== null) {
                                                                        handleReorderGroup(draggedGroupId, group.id);
                                                                        setDraggedGroupId(null);
                                                                    } else if (draggedAttr) {
                                                                        handlePlaceOrMoveAttribute(
                                                                            draggedAttr.attr,
                                                                            draggedAttr.sourceGroupId,
                                                                            group.id,
                                                                        );
                                                                        setDraggedAttr(null);
                                                                    }
                                                                }}
                                                            >
                                                                {/* หัวข้อกลุ่ม */}
                                                                <div className={styles.groupHeader}>
                                                                    <div className={styles.groupToggle}>
                                                                        <Button
                                                                            design="Transparent"
                                                                            icon={isExpanded ? 'navigation-down-arrow' : 'navigation-right-arrow'}
                                                                            accessibleName={group.name}
                                                                            onClick={() => toggleGroupExpand(group.id)}
                                                                        />
                                                                        <div
                                                                            draggable
                                                                            onDragStart={(e) => {
                                                                                e.stopPropagation();
                                                                                setDraggedGroupId(group.id);
                                                                            }}
                                                                            onDragEnd={() => setDraggedGroupId(null)}
                                                                            style={{ display: 'flex', cursor: 'grab' }}
                                                                        >
                                                                            <Icon name="vertical-grip" className={styles.gripIcon} />
                                                                        </div>
                                                                        <div
                                                                            className={styles.groupToggle}
                                                                            onClick={() => toggleGroupExpand(group.id)}
                                                                        >
                                                                            <Icon name="folder-blank" className={styles.mutedIcon} />
                                                                            <span className={styles.groupName}>{group.name}</span>
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        design="Transparent"
                                                                        icon="delete"
                                                                        style={{ color: 'var(--sapNegativeTextColor)' }}
                                                                        accessibleName="Delete Group"
                                                                        onClick={() => handleRemoveGroup(group.id)}
                                                                    />
                                                                </div>

                                                                {/* รายการแอตทริบิวต์ในกลุ่ม */}
                                                                {isExpanded && (
                                                                    <div className={styles.groupAttrs}>
                                                                        {visibleAttrs.map((attr, attrIndex) => {
                                                                            const placedGroupCount = assignedGroups.filter((g) =>
                                                                                g.attributes.some((a) => a.id === attr.id),
                                                                            ).length;

                                                                            return (
                                                                                <div
                                                                                    key={attr.id}
                                                                                    className={styles.attrRow}
                                                                                    draggable
                                                                                    onDragStart={() =>
                                                                                        setDraggedAttr({ attr, sourceGroupId: group.id })
                                                                                    }
                                                                                    onDragOver={(e) => e.preventDefault()}
                                                                                    onDrop={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        if (draggedAttr) {
                                                                                            handlePlaceOrMoveAttribute(
                                                                                                draggedAttr.attr,
                                                                                                draggedAttr.sourceGroupId,
                                                                                                group.id,
                                                                                                attrIndex,
                                                                                            );
                                                                                            setDraggedAttr(null);
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    <div className={styles.attrLabel}>
                                                                                        <Icon name="vertical-grip" className={styles.gripIcon} />
                                                                                        <span className={styles.attrName}>
                                                                                            {attr.name || attr.code}
                                                                                        </span>
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
                                                                                            onClick={() =>
                                                                                                handleRemoveAttributeFromGroup(attr, group.id)
                                                                                            }
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                        {!groupQuery && group.attributes.length === 0 && (
                                                                            <span className={styles.dropHint}>Drop attribute here</span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* พื้นที่วางสำหรับแอตทริบิวต์ที่ยังไม่ได้จัดกลุ่ม */}
                                    <div>
                                        <div className={styles.unassignedHeader}>
                                            <span className={styles.columnTitle}>Unassigned Attributes</span>
                                            <Input
                                                value={attrSearch}
                                                onInput={(e) => setAttrSearch(e.target.value)}
                                                placeholder="Search"
                                                icon={<Icon name="search" />}
                                                className={styles.searchInput}
                                            />
                                        </div>
                                        <span className={styles.caption} style={{ marginBottom: '0.75rem' }}>
                                            Drag attribute here to unassign from group.
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
                                                    className={styles.unassignedItem}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        if (requireGroupBeforeAssigning()) {
                                                            e.preventDefault();
                                                            return;
                                                        }
                                                        setDraggedAttr({ attr, sourceGroupId: null });
                                                    }}
                                                    onClick={() => {
                                                        if (requireGroupBeforeAssigning()) return;
                                                        handlePlaceOrMoveAttribute(attr, null, assignedGroups[0].id);
                                                    }}
                                                >
                                                    <Icon name="vertical-grip" className={styles.gripIcon} />
                                                    <span className={styles.attrName}>{attr.name || attr.code}</span>
                                                </div>
                                            ))}
                                            {filteredUnassigned.length === 0 && (
                                                <span className={styles.unassignedEmpty}>Drop here to unassign attributes.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* คอลัมน์ขวา: ส่วนข้อมูลทั่วไปและป้ายชื่อ */}
                            <div className={styles.rightColumn}>
                                {/* ส่วนข้อมูลทั่วไป */}
                                <div className={styles.card}>
                                    <Title level="H5" className={styles.cardTitle}>
                                        General
                                    </Title>
                                    {/* แก้ code ได้เฉพาะคนที่มีสิทธิ์ attribute_families.edit_code
                                (เช็คซ้ำฝั่ง server ด้วย CodeRenameGuard) — family ของ
                                WooCommerce ล็อกไว้เสมอเพราะ generator หาด้วย code นี้ */}
                                    <div className={styles.codeField}>
                                        <Label for="attribute-family-code" showColon={false}>
                                            Code
                                        </Label>
                                        <Input
                                            id="attribute-family-code"
                                            value={data.code}
                                            disabled={!canEditCode}
                                            maxlength={100}
                                            valueState={ui5ValueState(valueStateOf(errors.code))}
                                            onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                                        />
                                        <span className={errors.code ? styles.hintError : styles.hint}>
                                            {errors.code || t(codeHintKey({ canEditCode, codeLocked }))}
                                        </span>
                                    </div>
                                </div>

                                <LocaleLabelFields
                                    values={data.translations}
                                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                                />
                            </div>
                        </div>

                        <FioriFormErrorSummary
                            errors={errors}
                            message="Please correct the highlighted fields before saving."
                            className={styles.errorStrip}
                        />
                    </>
                )}
            </form>

            {/* Options — รวมการ์ด "เริ่มต้น" กับ "ยกเลิกตั้งตระกูลให้ทุกกลุ่มสินค้า"
                ที่เคยอยู่คอลัมน์ขวาไว้ใน modal เดียว เปิดจากปุ่ม ⋯ Options ที่หัวหน้า */}
            <Dialog
                open={optionsDialogOpen}
                onClose={() => setOptionsDialogOpen(false)}
                header={dialogHeader(t('familyOptions'), () => setOptionsDialogOpen(false))}
                style={{ width: 'min(600px, 92vw)' }}
            >
                <div className={styles.optionsBody}>
                    {/* ตั้งเป็นตระกูลเริ่มต้นให้ทุกกลุ่มสินค้า — ดัน family นี้ไปไว้ที่
                        sort_order=0 ของทุกกลุ่มสินค้าในระบบ (ทับของเดิมถ้ามี) */}
                    <div className={styles.optionsSection}>
                        <Title level="H5">{t('defaultFamilyBadge')}</Title>
                        <span className={styles.subtitle}>{t('setDefaultForAllGroupsDescription')}</span>
                        {/* สิทธิ์ "assign_default_family" แยกออกมาจาก edit_attribute_families
                            ทั่วไป (ดู routes/catalog.php) เพราะปุ่มนี้ทับ default family ของ
                            "ทุก" กลุ่มสินค้าในระบบพร้อมกัน — ต่างจากการแก้ไข family ทีละตัว —
                            ไม่ซ่อนปุ่มไปเลย แค่ disable + บอกเหตุผลผ่าน tooltip ให้รู้ว่า
                            ฟีเจอร์นี้มีอยู่แต่ต้องขอสิทธิ์เพิ่ม */}
                        <div className={styles.optionsButtons}>
                            <span title={canAssignDefaultFamily ? undefined : t('setDefaultForAllGroupsNoPermission')}>
                                <Button
                                    design="Attention"
                                    disabled={settingDefault || !canAssignDefaultFamily}
                                    loading={settingDefault}
                                    onClick={() => runOption(setAsDefaultForAllGroups)}
                                >
                                    {t('setDefaultForAllGroups')}
                                </Button>
                            </span>
                            {/* "บางกลุ่มสินค้า" — คู่หูของปุ่มด้านบน แต่เลือกทีละกลุ่มผ่าน dialog
                                ค้นหา/แบ่งหน้าได้ แทนที่จะทับทุกกลุ่มในระบบทีเดียว ใช้สิทธิ์
                                assign_default_family ตัวเดียวกัน เพราะเป็นความสามารถเดียวกัน
                                แค่จำกัดขอบเขตแคบกว่า */}
                            <span title={canAssignDefaultFamily ? undefined : t('setDefaultForAllGroupsNoPermission')}>
                                <Button
                                    design="Positive"
                                    disabled={!canAssignDefaultFamily}
                                    onClick={() => runOption(() => setSelectGroupsDialogOpen(true))}
                                >
                                    {t('setDefaultForSomeGroups')}
                                </Button>
                            </span>
                        </div>
                    </div>

                    <div className={styles.divider} />

                    {/* ยกเลิกการตั้งตระกูลนี้ให้กลุ่มสินค้า — ทิศทางตรงข้ามของการ์ดด้านบน
                        ถอด family นี้ออกจากกลุ่มสินค้าที่ผูกอยู่ (ไม่ว่าจะเป็น default
                        หรือแค่ต่อท้ายก็ตาม) ใช้สิทธิ์ assign_default_family ตัวเดียวกัน */}
                    <div className={styles.optionsSection}>
                        <Title level="H5">{t('unsetDefaultForAllGroups')}</Title>
                        <span className={styles.subtitle}>{t('unsetDefaultForAllGroupsDescription')}</span>
                        <div className={styles.optionsButtons}>
                            <span title={canAssignDefaultFamily ? undefined : t('unsetDefaultForAllGroupsNoPermission')}>
                                <Button
                                    design="Negative"
                                    disabled={unassigningAll || !canAssignDefaultFamily}
                                    loading={unassigningAll}
                                    onClick={() => runOption(unassignFromAllGroups)}
                                >
                                    {t('unsetDefaultForAllGroups')}
                                </Button>
                            </span>
                            <span title={canAssignDefaultFamily ? undefined : t('unsetDefaultForAllGroupsNoPermission')}>
                                <Button disabled={!canAssignDefaultFamily} onClick={() => runOption(() => setUnassignDialogOpen(true))}>
                                    {t('unsetDefaultForSomeGroups')}
                                </Button>
                            </span>
                        </div>
                    </div>
                </div>
            </Dialog>

            {/* ไดอะล็อกสำหรับกำหนดกลุ่มแอตทริบิวต์ */}
            <Dialog
                open={assignDialogOpen}
                onClose={closeAssignDialog}
                header={dialogHeader(t('assignAttributeGroup'), closeAssignDialog)}
                style={{ width: 'min(444px, 92vw)' }}
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
                    <Label for="assign-attribute-groups" showColon={false} className={styles.fieldLabel}>
                        {t('groupsRequired')}
                    </Label>
                    {assignableGroups.length === 0 ? (
                        <span className={styles.italicHint}>
                            {groups.length === 0 ? t('noAttributeGroupsAvailable') : t('allAttributeGroupsAssigned')}
                        </span>
                    ) : (
                        <MultiComboBox
                            id="assign-attribute-groups"
                            className={styles.multiCombo}
                            placeholder={t('selectOption')}
                            onSelectionChange={(e) => setSelectedGroupIds(e.detail.items.map((item) => Number(item.value)))}
                        >
                            {assignableGroups.map((grp) => (
                                <MultiComboBoxItem
                                    key={grp.id}
                                    value={String(grp.id)}
                                    text={grp.name || grp.code}
                                    selected={selectedGroupIds.includes(grp.id)}
                                />
                            ))}
                        </MultiComboBox>
                    )}
                </div>
            </Dialog>

            {/* ไดอะล็อก "ใช้เทมเพลตจาก..." — 2 ขั้นตอน: เลือกตระกูลต้นแบบ แล้วพรีวิว
            โครงสร้างของมันก่อนกดยืนยัน (ตามที่ผู้ใช้ขอ — ต้องเห็นก่อนค่อยกดยืนยัน
            ไม่ใช่ apply ทันทีที่เลือก) */}
            <Dialog
                open={templateDialogOpen}
                onClose={closeTemplateDialog}
                header={dialogHeader(t('useTemplateFrom'), closeTemplateDialog)}
                style={{ width: 'min(444px, 92vw)' }}
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
                        <span className={styles.subtitle}>{t('useTemplateFromHelp')}</span>
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
                        <span className={styles.subtitle}>
                            {t('useTemplateFromPreviewHelp', {
                                name:
                                    otherFamilies.find((f) => f.id === selectedTemplateId)?.name ||
                                    otherFamilies.find((f) => f.id === selectedTemplateId)?.code ||
                                    '',
                            })}
                        </span>
                        {(templatePreviewGroups?.length ?? 0) === 0 ? (
                            <span className={styles.italicHint}>{t('useTemplateFromEmpty')}</span>
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

            {/* เดิมเป็น MUI Snackbar มุมขวาบน — แถบเตือนลอย ปิดเองหลัง 7 วินาที (ดู effect ด้านบน) */}
            {noGroupWarningOpen && (
                <div className={styles.warningToast}>
                    <FioriMessageStrip severity="warning" onClose={() => setNoGroupWarningOpen(false)}>
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
                    </FioriMessageStrip>
                </div>
            )}

            {/* เมนู "เพิ่มเข้าอีกกลุ่ม" — เปิดจากปุ่ม + บนแถวแอตทริบิวต์ที่ถูกจัดกลุ่ม
                แล้ว โชว์เฉพาะกลุ่มที่ attribute ตัวนี้ "ยังไม่ได้" อยู่ (กันเพิ่มซ้ำ) */}
            <Menu opener={addToGroupMenu?.element ?? null} open={Boolean(addToGroupMenu)} onClose={() => setAddToGroupMenu(null)}>
                {addToGroupMenu &&
                    (() => {
                        const otherGroups = assignedGroups.filter(
                            (g) => g.id !== addToGroupMenu.currentGroupId && !g.attributes.some((a) => a.id === addToGroupMenu.attr.id),
                        );

                        if (otherGroups.length === 0) {
                            return <MenuItem disabled text={t('noOtherGroupsAvailable')} />;
                        }

                        return otherGroups.map((g) => (
                            <MenuItem
                                key={g.id}
                                text={g.name}
                                onClick={() => {
                                    handleAddAttributeToGroup(addToGroupMenu.attr, g.id);
                                    setAddToGroupMenu(null);
                                }}
                            />
                        ));
                    })()}
            </Menu>

            {/* "กำหนดค่าเริ่มต้นบางกลุ่มสินค้า" — picker ค้นหา/แบ่งหน้าได้ (กลุ่มสินค้า
                ในระบบมีหลักร้อยตัว โหลดมาครั้งเดียวทั้งหมดไม่ไหว) แต่ละแถวโชว์ชัดว่า
                ตระกูลนี้เป็นค่าเริ่มต้นของกลุ่มนั้นอยู่แล้วหรือยัง — checkbox เริ่มต้น
                "ไม่ติ๊ก" เสมอไม่ว่าจะ default อยู่แล้วหรือไม่ (คือ "จะสั่งตั้งค่าไหม"
                ไม่ใช่ "ตั้งอยู่แล้วหรือเปล่า" สองเรื่องนี้แยกกัน) เลือกจากหลายหน้า/
                หลายคำค้นสะสมกันได้ก่อนค่อยกด Apply ทีเดียว */}
            <Dialog
                open={selectGroupsDialogOpen}
                onClose={closeSelectGroupsDialog}
                header={dialogHeader(t('setDefaultForSomeGroups'), closeSelectGroupsDialog)}
                style={{ width: 'min(600px, 92vw)', height: '80vh' }}
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <>
                                <Button design="Transparent" onClick={closeSelectGroupsDialog}>
                                    {t('cancel')}
                                </Button>
                                <Button
                                    design="Emphasized"
                                    disabled={selectedProductGroupIds.size === 0 || applyingSelectedGroups}
                                    loading={applyingSelectedGroups}
                                    onClick={applySelectedGroups}
                                >
                                    {t('setDefaultForSomeGroups')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                <div className={styles.pickerBody}>
                    <div className={styles.pickerSearch}>
                        <Input
                            value={groupPickerSearch}
                            onInput={(e) => setGroupPickerSearch(e.target.value)}
                            placeholder={t('search')}
                            icon={<Icon name="search" />}
                        />
                        {selectedProductGroupIds.size > 0 && (
                            <span className={styles.pickerSelected}>{t('selectedGroupsCount', { count: selectedProductGroupIds.size })}</span>
                        )}
                    </div>

                    <div className={styles.pickerList}>
                        {groupPickerLoading ? (
                            <div className={styles.pickerLoading}>
                                <BusyIndicator active size="M" />
                            </div>
                        ) : !groupPickerData || groupPickerData.data.length === 0 ? (
                            <div className={styles.pickerEmpty}>{t('noProductGroupsFound')}</div>
                        ) : (
                            groupPickerData.data.map((group) => (
                                <div key={group.id} className={styles.pickerItem} onClick={() => toggleGroupSelected(group.id)}>
                                    <CheckBox checked={selectedProductGroupIds.has(group.id)} accessibleName={group.name} />
                                    <div className={styles.pickerItemText}>
                                        <span className={styles.pickerItemName}>{group.name}</span>
                                        <span className={styles.pickerItemPath}>
                                            {[group.category_name, group.subcategory_name].filter(Boolean).join(' / ')}
                                        </span>
                                    </div>
                                    {group.is_default && <span className={styles.defaultBadge}>{t('alreadyDefaultHere')}</span>}
                                </div>
                            ))
                        )}
                    </div>

                    {groupPickerData && groupPickerData.last_page > 1 && (
                        <div className={styles.pager}>
                            <Button
                                design="Transparent"
                                icon="slim-arrow-left"
                                disabled={groupPickerPage <= 1}
                                onClick={() => setGroupPickerPage((p) => p - 1)}
                            />
                            <span>
                                {groupPickerData.current_page} / {groupPickerData.last_page}
                            </span>
                            <Button
                                design="Transparent"
                                icon="slim-arrow-right"
                                disabled={groupPickerPage >= groupPickerData.last_page}
                                onClick={() => setGroupPickerPage((p) => p + 1)}
                            />
                        </div>
                    )}
                </div>
            </Dialog>

            {/* ไดอะล็อก "ยกเลิกให้บางกลุ่มสินค้า" — คู่หูของ dialog ด้านบน แต่แสดง
                เฉพาะกลุ่มสินค้าที่ผูกกับตระกูลนี้อยู่แล้วเท่านั้น (productGroupsForUnassignPicker) */}
            <Dialog
                open={unassignDialogOpen}
                onClose={closeUnassignDialog}
                header={dialogHeader(t('unsetDefaultForSomeGroups'), closeUnassignDialog)}
                style={{ width: 'min(600px, 92vw)', height: '80vh' }}
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <>
                                <Button design="Transparent" onClick={closeUnassignDialog}>
                                    {t('cancel')}
                                </Button>
                                <Button
                                    design="Negative"
                                    disabled={selectedUnassignGroupIds.size === 0 || applyingUnassignGroups}
                                    loading={applyingUnassignGroups}
                                    onClick={applyUnassignGroups}
                                >
                                    {t('unsetDefaultForSomeGroups')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                <div className={styles.pickerBody}>
                    <div className={styles.pickerSearch}>
                        <Input
                            value={unassignPickerSearch}
                            onInput={(e) => setUnassignPickerSearch(e.target.value)}
                            placeholder={t('search')}
                            icon={<Icon name="search" />}
                        />

                        <div className={styles.pickerLinks}>
                            <Button
                                design="Transparent"
                                onClick={selectAllUnassignMatching}
                                disabled={selectAllUnassignLoading || !unassignPickerData || unassignPickerData.total === 0}
                                loading={selectAllUnassignLoading}
                            >
                                {t('selectAllMatching', { count: unassignPickerData?.total ?? 0 })}
                            </Button>
                            {selectedUnassignGroupIds.size > 0 && (
                                <Button design="Transparent" onClick={clearUnassignSelection}>
                                    {t('clearSelection')}
                                </Button>
                            )}
                        </div>

                        {selectedUnassignGroupIds.size > 0 && (
                            <span className={styles.pickerSelected}>{t('selectedGroupsCount', { count: selectedUnassignGroupIds.size })}</span>
                        )}
                    </div>

                    <div className={styles.pickerList}>
                        {unassignPickerLoading ? (
                            <div className={styles.pickerLoading}>
                                <BusyIndicator active size="M" />
                            </div>
                        ) : !unassignPickerData || unassignPickerData.data.length === 0 ? (
                            <div className={styles.pickerEmpty}>{t('noProductGroupsAssigned')}</div>
                        ) : (
                            unassignPickerData.data.map((group) => (
                                <div key={group.id} className={styles.pickerItem} onClick={() => toggleUnassignGroupSelected(group.id)}>
                                    <CheckBox checked={selectedUnassignGroupIds.has(group.id)} accessibleName={group.name} />
                                    <div className={styles.pickerItemText}>
                                        <span className={styles.pickerItemName}>{group.name}</span>
                                        <span className={styles.pickerItemPath}>
                                            {[group.category_name, group.subcategory_name].filter(Boolean).join(' / ')}
                                        </span>
                                    </div>
                                    {group.is_default && <span className={styles.defaultBadge}>{t('alreadyDefaultHere')}</span>}
                                </div>
                            ))
                        )}
                    </div>

                    {unassignPickerData && unassignPickerData.last_page > 1 && (
                        <div className={styles.pager}>
                            <Button
                                design="Transparent"
                                icon="slim-arrow-left"
                                disabled={unassignPickerPage <= 1}
                                onClick={() => setUnassignPickerPage((p) => p - 1)}
                            />
                            <span>
                                {unassignPickerData.current_page} / {unassignPickerData.last_page}
                            </span>
                            <Button
                                design="Transparent"
                                icon="slim-arrow-right"
                                disabled={unassignPickerPage >= unassignPickerData.last_page}
                                onClick={() => setUnassignPickerPage((p) => p + 1)}
                            />
                        </div>
                    )}
                </div>
            </Dialog>
            {confirmElement}
        </AppLayout>
    );
}
