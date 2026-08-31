import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import DeleteIcon from '@mui/icons-material/Delete';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    Grid,
    IconButton,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx, fioriGhostSx } from '@/lib/fiori-style';

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
    canViewHistory?: boolean;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTE FAMILIES', href: '/catalog/attributeFamilies' },
    { title: 'EDIT ATTRIBUTE FAMILY', href: '#' },
];

export default function AttributeFamilyEdit({ family, translations, groups, attributes, familyAttributes = [], canViewHistory = false }: Props) {
    const { t } = useTranslation('catalog');
    const [tabIndex, setTabIndex] = useState(0);
    const { data, setData, put, processing, errors, isDirty } = useForm({
        code: family.code || '',
        translations: translations || {},
    });

    const [attrSearch, setAttrSearch] = useState('');
    // ค้นหาแอตทริบิวต์ในคอลัมน์หลัก (กลุ่มที่จัดไว้แล้ว) — คนละช่องกับ attrSearch
    // ของคอลัมน์ Unassigned
    const [groupAttrSearch, setGroupAttrSearch] = useState('');
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<number | string>('');
    const [assignedGroups, setAssignedGroups] = useState<AssignedGroup[]>([]);
    const [unassignedAttrs, setUnassignedAttrs] = useState<AttributeItem[]>([]);
    const [draggedAttr, setDraggedAttr] = useState<AttributeItem | null>(null);
    const [draggedGroupId, setDraggedGroupId] = useState<number | null>(null);
    const [noGroupWarningOpen, setNoGroupWarningOpen] = useState(false);
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

    useEffect(() => {
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
    }, [familyAttributes, attributes]);

    const filteredUnassigned = unassignedAttrs.filter((attr) => {
        const title = attr.name || attr.code;
        return title.toLowerCase().includes(attrSearch.toLowerCase());
    });

    const groupQuery = groupAttrSearch.trim().toLowerCase();
    const matchesGroupQuery = (attr: AttributeItem) => (attr.name || attr.code).toLowerCase().includes(groupQuery);
    // เมื่อมีคำค้น: กลุ่มที่ยังมีแอตทริบิวต์ตรงกันอย่างน้อยหนึ่งตัว
    const groupSearchHasResults = !groupQuery || assignedGroups.some((g) => g.attributes.some(matchesGroupQuery));

    const toggleGroupExpand = (groupId: number) => {
        setAssignedGroups((prev) =>
            prev.map((g) => (g.id === groupId ? { ...g, expanded: !g.expanded } : g))
        );
    };

    const handleAssignGroup = () => {
        if (!selectedGroupId) return;

        const groupObj = groups.find((g) => g.id === Number(selectedGroupId));
        if (groupObj) {
            const exists = assignedGroups.some((g) => g.id === groupObj.id);
            if (!exists) {
                setGroupsDirty(true);
                setAssignedGroups((prev) => [
                    ...prev,
                    {
                        id: groupObj.id,
                        code: groupObj.code,
                        name: groupObj.name || groupObj.code.charAt(0).toUpperCase() + groupObj.code.slice(1),
                        attributes: [],
                        expanded: true,
                    },
                ]);
            }
        }

        setSelectedGroupId('');
        setAssignDialogOpen(false);
    };

    // ฟังก์ชันนี้จัดการทั้งกรณี "กำหนดเข้ากลุ่ม" (ไม่ส่ง targetIndex มา -> จะเพิ่มต่อท้ายให้)
    // และกรณี "จัดเรียงใหม่ภายใน/เข้าไปในกลุ่มที่ตำแหน่งที่ระบุ" (ลากไปวางทับ
    // แอตทริบิวต์ตัวอื่น) จะลบแอตทริบิวต์ออกจากตำแหน่งเดิมก่อนเสมอ
    // ดังนั้นการลากภายในกลุ่มเดียวกันจะเป็นการย้ายตำแหน่ง ไม่ใช่การสร้างซ้ำ
    const handleDropAttribute = (attr: AttributeItem, targetGroupId: number, targetIndex?: number) => {
        setGroupsDirty(true);
        setUnassignedAttrs((prev) => prev.filter((a) => a.id !== attr.id));
        setAssignedGroups((prev) =>
            prev.map((g) => {
                const cleanAttrs = g.attributes.filter((a) => a.id !== attr.id);
                if (g.id !== targetGroupId) {
                    return { ...g, attributes: cleanAttrs };
                }
                const insertAt = targetIndex === undefined ? cleanAttrs.length : Math.min(targetIndex, cleanAttrs.length);
                return { ...g, attributes: [...cleanAttrs.slice(0, insertAt), attr, ...cleanAttrs.slice(insertAt)] };
            })
        );
    };

    const handleMoveAttributeToUnassigned = (attr: AttributeItem) => {
        setGroupsDirty(true);
        setAssignedGroups((prev) =>
            prev.map((g) => ({
                ...g,
                attributes: g.attributes.filter((a) => a.id !== attr.id),
            }))
        );
        setUnassignedAttrs((prev) => {
            if (prev.some((a) => a.id === attr.id)) return prev;
            return [...prev, attr];
        });
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
            setUnassignedAttrs((prev) => [...prev, ...groupToRemove.attributes]);
        }
        setAssignedGroups((prev) => prev.filter((g) => g.id !== groupId));
    };

    const handleDeleteAllGroups = () => {
        setGroupsDirty(true);
        const allAssigned = assignedGroups.flatMap((g) => g.attributes);
        setUnassignedAttrs((prev) => [...prev, ...allAssigned]);
        setAssignedGroups([]);
    };

    const submit = (e?: FormEvent) => {
        if (e) e.preventDefault();

        const groupAttrsPayload: { attribute_id: number; attribute_group_id: number }[] = [];
        assignedGroups.forEach((g) => {
            g.attributes.forEach((attr) => {
                groupAttrsPayload.push({
                    attribute_group_id: g.id,
                    attribute_id: attr.id,
                });
            });
        });

        skipNavigationGuardRef.current = true;
        router.put(`/catalog/attributeFamilies/${family.id}`, {
            code: data.code,
            translations: data.translations,
            group_attributes: groupAttrsPayload,
        }, {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Attribute Family: ${family.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {canViewHistory && (
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{ mb: 3, borderBottom: `1px solid ${FIORI.border}` }}
                    >
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/attributeFamilies/${family.id}/history`} />}

                {tabIndex === 0 && (
                <>
                {/* หัวข้อและปุ่มต่างๆ */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        Edit Attribute Family
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/catalog/attributeFamilies"
                            variant="outlined"
                            sx={fioriDefaultSx}
                        >
                            Back
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={{ ...fioriEmphasizedSx, px: 2.5 }}
                        >
                            {processing ? 'Saving…' : 'Save Attribute Family'}
                        </Button>
                    </Stack>
                </Stack>

                <Grid container spacing={3}>
                    {/* คอลัมน์ซ้าย: กลุ่มและแอตทริบิวต์ที่ยังไม่ได้จัดกลุ่ม */}
                    <Grid item xs={12} md={8}>
                        <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                <Box>
                                    <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                        Attribute Groups
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                        Manage attribute family groups
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1.5}>
                                    <Button
                                        onClick={handleDeleteAllGroups}
                                        sx={{ ...fioriGhostSx, color: FIORI.error }}
                                    >
                                        Delete Group
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={() => setAssignDialogOpen(true)}
                                        sx={fioriDefaultSx}
                                    >
                                        Assign Attribute Group
                                    </Button>
                                </Stack>
                            </Stack>

                            <Grid container spacing={3} sx={{ mt: 1 }}>
                                {/* ส่วนคอลัมน์หลัก */}
                                <Grid item xs={12} sm={6}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                                        <Typography variant="subtitle2" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                            Main Column
                                        </Typography>
                                        <TextField
                                            value={groupAttrSearch}
                                            onChange={(e) => setGroupAttrSearch(e.target.value)}
                                            size="small"
                                            variant="standard"
                                            placeholder="Search"
                                            InputProps={{
                                                disableUnderline: true,
                                                endAdornment: <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />,
                                            }}
                                            sx={{ width: 100 }}
                                        />
                                    </Stack>

                                    <Box
                                        sx={{
                                            minHeight: 400,
                                            maxHeight: 550,
                                            overflowY: 'auto',
                                            pr: 1,
                                        }}
                                    >
                                        {assignedGroups.length === 0 ? (
                                            <Box sx={{ border: `1px dashed ${FIORI.border}`, borderRadius: '8px', p: 4, textAlign: 'center' }}>
                                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                                    No groups assigned yet. Click "Assign Attribute Group" to add groups.
                                                </Typography>
                                            </Box>
                                        ) : !groupSearchHasResults ? (
                                            <Box sx={{ border: `1px dashed ${FIORI.border}`, borderRadius: '8px', p: 4, textAlign: 'center' }}>
                                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                                    No attributes match “{groupAttrSearch.trim()}”.
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Stack spacing={1}>
                                                {assignedGroups.map((group) => {
                                                    const visibleAttrs = groupQuery
                                                        ? group.attributes.filter(matchesGroupQuery)
                                                        : group.attributes;
                                                    if (groupQuery && visibleAttrs.length === 0) return null;
                                                    const isExpanded = groupQuery ? true : group.expanded;
                                                    return (
                                                    <Box
                                                        key={group.id}
                                                        onDragOver={(e) => e.preventDefault()}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            if (draggedGroupId !== null) {
                                                                handleReorderGroup(draggedGroupId, group.id);
                                                                setDraggedGroupId(null);
                                                            } else if (draggedAttr) {
                                                                handleDropAttribute(draggedAttr, group.id);
                                                                setDraggedAttr(null);
                                                            }
                                                        }}
                                                        sx={{
                                                            p: 1,
                                                            borderRadius: 1.5,
                                                            border: '1px dashed transparent',
                                                            '&:hover': { border: `1px dashed ${FIORI.brand}`, bgcolor: FIORI.selected },
                                                        }}
                                                    >
                                                        {/* หัวข้อกลุ่ม */}
                                                        <Stack
                                                            direction="row"
                                                            alignItems="center"
                                                            justifyContent="space-between"
                                                            sx={{
                                                                py: 0.5,
                                                                cursor: 'pointer',
                                                                userSelect: 'none',
                                                                '&:hover': { color: FIORI.brand },
                                                            }}
                                                        >
                                                            <Stack direction="row" alignItems="center" spacing={0.5}>
                                                                <IconButton size="small" sx={{ p: 0.2 }} onClick={() => toggleGroupExpand(group.id)}>
                                                                    {isExpanded ? (
                                                                        <KeyboardArrowDownIcon fontSize="small" />
                                                                    ) : (
                                                                        <KeyboardArrowRightIcon fontSize="small" />
                                                                    )}
                                                                </IconButton>
                                                                <Box
                                                                    draggable
                                                                    onDragStart={(e) => {
                                                                        e.stopPropagation();
                                                                        setDraggedGroupId(group.id);
                                                                    }}
                                                                    onDragEnd={() => setDraggedGroupId(null)}
                                                                    sx={{ display: 'flex', cursor: 'grab' }}
                                                                >
                                                                    <DragIndicatorIcon fontSize="small" sx={{ color: FIORI.textSecondary, fontSize: 16 }} />
                                                                </Box>
                                                                <Stack
                                                                    direction="row"
                                                                    alignItems="center"
                                                                    spacing={0.5}
                                                                    onClick={() => toggleGroupExpand(group.id)}
                                                                >
                                                                    <FolderOutlinedIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />
                                                                    <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                                                        {group.name}
                                                                    </Typography>
                                                                </Stack>
                                                            </Stack>
                                                            <IconButton size="small" color="error" onClick={() => handleRemoveGroup(group.id)}>
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Stack>

                                                        {/* รายการแอตทริบิวต์ในกลุ่ม */}
                                                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                                            <Stack spacing={0.5} sx={{ pl: 4, pt: 0.5, pb: 1 }}>
                                                                {visibleAttrs.map((attr, attrIndex) => (
                                                                    <Stack
                                                                        key={attr.id}
                                                                        draggable
                                                                        onDragStart={() => setDraggedAttr(attr)}
                                                                        onDragOver={(e) => e.preventDefault()}
                                                                        onDrop={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            if (draggedAttr) {
                                                                                handleDropAttribute(draggedAttr, group.id, attrIndex);
                                                                                setDraggedAttr(null);
                                                                            }
                                                                        }}
                                                                        direction="row"
                                                                        alignItems="center"
                                                                        justifyContent="space-between"
                                                                        sx={{
                                                                            py: 0.5,
                                                                            px: 1,
                                                                            borderRadius: 1,
                                                                            cursor: 'grab',
                                                                            bgcolor: FIORI.surface,
                                                                            border: `1px solid ${FIORI.border}`,
                                                                            '&:hover': { bgcolor: FIORI.hover, borderColor: FIORI.brand },
                                                                        }}
                                                                    >
                                                                        <Stack direction="row" alignItems="center" spacing={1}>
                                                                            <DragIndicatorIcon fontSize="small" sx={{ color: FIORI.border, fontSize: 16 }} />
                                                                            <Typography variant="body2" sx={{ color: FIORI.textPrimary, fontSize: '0.85rem' }}>
                                                                                {attr.name || attr.code}
                                                                            </Typography>
                                                                        </Stack>
                                                                        <IconButton
                                                                            size="small"
                                                                            onClick={() => handleMoveAttributeToUnassigned(attr)}
                                                                            sx={{ color: FIORI.textSecondary, '&:hover': { color: FIORI.error } }}
                                                                        >
                                                                            <RemoveCircleOutlineIcon fontSize="small" sx={{ fontSize: 16 }} />
                                                                        </IconButton>
                                                                    </Stack>
                                                                ))}
                                                                {!groupQuery && group.attributes.length === 0 && (
                                                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary, pl: 1, fontStyle: 'italic' }}>
                                                                        Drop attribute here
                                                                    </Typography>
                                                                )}
                                                            </Stack>
                                                        </Collapse>
                                                    </Box>
                                                    );
                                                })}
                                            </Stack>
                                        )}
                                    </Box>
                                </Grid>

                                {/* พื้นที่วางสำหรับแอตทริบิวต์ที่ยังไม่ได้จัดกลุ่ม */}
                                <Grid item xs={12} sm={6}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                        <Typography variant="subtitle2" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                            Unassigned Attributes
                                        </Typography>
                                        <TextField
                                            value={attrSearch}
                                            onChange={(e) => setAttrSearch(e.target.value)}
                                            size="small"
                                            variant="standard"
                                            placeholder="Search"
                                            InputProps={{
                                                disableUnderline: true,
                                                endAdornment: <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />,
                                            }}
                                            sx={{ width: 100 }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block', mb: 1.5 }}>
                                        Drag attribute here to unassign from group.
                                    </Typography>

                                    <Box
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (draggedAttr) {
                                                handleMoveAttributeToUnassigned(draggedAttr);
                                                setDraggedAttr(null);
                                            }
                                        }}
                                        sx={{
                                            minHeight: 400,
                                            maxHeight: 500,
                                            overflowY: 'auto',
                                            bgcolor: FIORI.surface,
                                            p: 1,
                                            borderRadius: '8px',
                                            border: '1px dashed transparent',
                                            '&:hover': { border: `1px dashed ${FIORI.brand}`, bgcolor: FIORI.selected },
                                        }}
                                    >
                                        <List dense disablePadding>
                                            {filteredUnassigned.map((attr) => (
                                                <ListItem
                                                    key={attr.id}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        if (requireGroupBeforeAssigning()) {
                                                            e.preventDefault();
                                                            return;
                                                        }
                                                        setDraggedAttr(attr);
                                                    }}
                                                    sx={{
                                                        py: 0.8,
                                                        px: 1,
                                                        mb: 0.5,
                                                        border: `1px solid ${FIORI.border}`,
                                                        borderRadius: '6px',
                                                        bgcolor: FIORI.surface,
                                                        '&:hover': { bgcolor: FIORI.hover, borderColor: FIORI.brand },
                                                        cursor: 'grab',
                                                    }}
                                                    onClick={() => {
                                                        if (requireGroupBeforeAssigning()) return;
                                                        handleDropAttribute(attr, assignedGroups[0].id);
                                                    }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 28, color: FIORI.border }}>
                                                        <DragIndicatorIcon fontSize="small" sx={{ fontSize: 16 }} />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={attr.name || attr.code}
                                                        primaryTypographyProps={{ variant: 'body2', sx: { color: FIORI.textPrimary }, fontSize: '0.85rem' }}
                                                    />
                                                </ListItem>
                                            ))}
                                            {filteredUnassigned.length === 0 && (
                                                <Typography variant="caption" sx={{ color: FIORI.textSecondary, p: 2, display: 'block', textAlign: 'center' }}>
                                                    Drop here to unassign attributes.
                                                </Typography>
                                            )}
                                        </List>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>

                    {/* คอลัมน์ขวา: ส่วนข้อมูลทั่วไปและป้ายชื่อ */}
                    <Grid item xs={12} md={4}>
                        <Stack spacing={3}>
                            {/* ส่วนข้อมูลทั่วไป */}
                            <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                                <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 2 }}>
                                    General
                                </Typography>
                                <TextField
                                    label="Code"
                                    fullWidth
                                    size="small"
                                    value={data.code}
                                    disabled
                                    helperText="This code is generated automatically and can't be changed."
                                />
                            </Paper>

                            <LocaleLabelFields
                                values={data.translations}
                                onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                            />
                        </Stack>
                    </Grid>
                </Grid>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 3 }}>
                        Please correct the highlighted fields before saving.
                    </Alert>
                )}
                </>
                )}
            </Box>

            {/* ไดอะล็อกสำหรับกำหนดกลุ่มแอตทริบิวต์ */}
            <Dialog
                open={assignDialogOpen}
                onClose={() => setAssignDialogOpen(false)}
                fullWidth
                maxWidth="xs"
                PaperProps={{ sx: { borderRadius: 2 } }}
            >
                <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        Assign Attribute Group
                    </Typography>
                    <IconButton onClick={() => setAssignDialogOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                        Groups *
                    </Typography>
                    <FormControl fullWidth size="small">
                        <Select
                            displayEmpty
                            value={selectedGroupId}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                            renderValue={(selected) => {
                                if (!selected) {
                                    return <Typography color="text.secondary">Select option</Typography>;
                                }
                                const g = groups.find((item) => item.id === Number(selected));
                                return g ? (g.name || g.code) : String(selected);
                            }}
                        >
                            <MenuItem value="" disabled>
                                Select option
                            </MenuItem>
                            {groups.map((grp) => (
                                <MenuItem key={grp.id} value={grp.id}>
                                    {grp.name || grp.code}
                                </MenuItem>
                            ))}
                            {groups.length === 0 && (
                                <MenuItem value="" disabled>
                                    No attribute groups available
                                </MenuItem>
                            )}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button
                        variant="contained"
                        onClick={handleAssignGroup}
                        disabled={!selectedGroupId}
                        sx={{ ...fioriEmphasizedSx, px: 2.5 }}
                    >
                        Assign Attribute Group
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={noGroupWarningOpen}
                autoHideDuration={7000}
                onClose={() => setNoGroupWarningOpen(false)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert
                    severity="warning"
                    onClose={() => setNoGroupWarningOpen(false)}
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() => {
                                setNoGroupWarningOpen(false);
                                setAssignDialogOpen(true);
                            }}
                        >
                            {t('assignAttributeGroup')}
                        </Button>
                    }
                >
                    {t('noAttributeGroupsWarning')}
                </Alert>
            </Snackbar>
        </AppLayout>
    );
}
