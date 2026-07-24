import LocaleLabelFields from '@/components/catalog/locale-label-fields';
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
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useEffect, useState } from 'react';

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
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTE FAMILIES', href: '/catalog/attributeFamilies' },
    { title: 'EDIT ATTRIBUTE FAMILY', href: '#' },
];

export default function AttributeFamilyEdit({ family, translations, groups, attributes, familyAttributes = [] }: Props) {
    const { data, setData, put, processing, errors } = useForm({
        code: family.code || '',
        translations: translations || {},
    });

    const [attrSearch, setAttrSearch] = useState('');
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<number | string>('');
    const [assignedGroups, setAssignedGroups] = useState<AssignedGroup[]>([]);
    const [unassignedAttrs, setUnassignedAttrs] = useState<AttributeItem[]>([]);
    const [draggedAttr, setDraggedAttr] = useState<AttributeItem | null>(null);

    useEffect(() => {
        // Build assignedGroups and unassignedAttrs from real DB familyAttributes & attributes props
        const groupsMap: Record<number, AssignedGroup> = {};
        const assignedAttrIds = new Set<number>();

        familyAttributes.forEach((item) => {
            const grpId = item.attribute_group_id;
            const grpCode = item.attribute_group?.code || `Group ${grpId}`;
            const grpName = item.attribute_group?.name || grpCode.charAt(0).toUpperCase() + grpCode.slice(1);

            if (!groupsMap[grpId]) {
                groupsMap[grpId] = {
                    id: grpId,
                    code: grpCode,
                    name: grpName,
                    attributes: [],
                    expanded: true,
                };
            }

            if (item.attribute) {
                groupsMap[grpId].attributes.push(item.attribute);
                assignedAttrIds.add(item.attribute.id);
            }
        });

        setAssignedGroups(Object.values(groupsMap));
        setUnassignedAttrs(attributes.filter((a) => !assignedAttrIds.has(a.id)));
    }, [familyAttributes, attributes]);

    const filteredUnassigned = unassignedAttrs.filter((attr) => {
        const title = attr.name || attr.code;
        return title.toLowerCase().includes(attrSearch.toLowerCase());
    });

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

    const handleMoveAttributeToGroup = (attr: AttributeItem, targetGroupId: number) => {
        setUnassignedAttrs((prev) => prev.filter((a) => a.id !== attr.id));
        setAssignedGroups((prev) =>
            prev.map((g) => {
                const cleanAttrs = g.attributes.filter((a) => a.id !== attr.id);
                if (g.id === targetGroupId) {
                    return { ...g, attributes: [...cleanAttrs, attr] };
                }
                return { ...g, attributes: cleanAttrs };
            })
        );
    };

    const handleMoveAttributeToUnassigned = (attr: AttributeItem) => {
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

    const handleRemoveGroup = (groupId: number) => {
        const groupToRemove = assignedGroups.find((g) => g.id === groupId);
        if (groupToRemove) {
            setUnassignedAttrs((prev) => [...prev, ...groupToRemove.attributes]);
        }
        setAssignedGroups((prev) => prev.filter((g) => g.id !== groupId));
    };

    const handleDeleteAllGroups = () => {
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

        router.put(`/catalog/attributeFamilies/${family.id}`, {
            code: data.code,
            translations: data.translations,
            group_attributes: groupAttrsPayload,
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Attribute Family: ${family.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: '#fbfbfe', minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="#1e1b4b">
                        Edit Attribute Family
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/catalog/attributeFamilies"
                            variant="outlined"
                            sx={{
                                color: 'primary.main',
                                borderColor: 'primary.main',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                '&:hover': { borderColor: 'primary.main' },
                            }}
                        >
                            Back
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            sx={{
                                bgcolor: 'primary.main',
                                color: '#fff',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                '&:hover': { bgcolor: 'primary.dark' },
                            }}
                        >
                            Save Attribute Family
                        </Button>
                    </Stack>
                </Stack>

                <Grid container spacing={3}>
                    {/* Left Column: Groups & Unassigned Attributes */}
                    <Grid item xs={12} md={8}>
                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                <Box>
                                    <Typography variant="h6" fontWeight={700} color="#1e1b4b">
                                        Attribute Groups
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Manage attribute family groups
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1.5}>
                                    <Button
                                        onClick={handleDeleteAllGroups}
                                        sx={{ color: '#ef4444', textTransform: 'none', fontWeight: 600 }}
                                    >
                                        Delete Group
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={() => setAssignDialogOpen(true)}
                                        sx={{
                                            color: 'primary.main',
                                            borderColor: 'primary.main',
                                            textTransform: 'none',
                                            fontWeight: 600,
                                            '&:hover': { borderColor: 'primary.main' },
                                        }}
                                    >
                                        Assign Attribute Group
                                    </Button>
                                </Stack>
                            </Stack>

                            <Grid container spacing={3} sx={{ mt: 1 }}>
                                {/* Main Column section */}
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="subtitle2" fontWeight={700} color="#334155" sx={{ mb: 1.5 }}>
                                        Main Column
                                    </Typography>

                                    <Box
                                        sx={{
                                            minHeight: 400,
                                            maxHeight: 550,
                                            overflowY: 'auto',
                                            pr: 1,
                                        }}
                                    >
                                        {assignedGroups.length === 0 ? (
                                            <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: 2, p: 4, textAlign: 'center' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    No groups assigned yet. Click "Assign Attribute Group" to add groups.
                                                </Typography>
                                            </Box>
                                        ) : (
                                            <Stack spacing={1}>
                                                {assignedGroups.map((group) => (
                                                    <Box
                                                        key={group.id}
                                                        onDragOver={(e) => e.preventDefault()}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            if (draggedAttr) {
                                                                handleMoveAttributeToGroup(draggedAttr, group.id);
                                                                setDraggedAttr(null);
                                                            }
                                                        }}
                                                        sx={{
                                                            p: 1,
                                                            borderRadius: 1.5,
                                                            border: '1px dashed transparent',
                                                            '&:hover': { border: '1px dashed #7c3aed', bgcolor: '#faf5ff' },
                                                        }}
                                                    >
                                                        {/* Group Header */}
                                                        <Stack
                                                            direction="row"
                                                            alignItems="center"
                                                            justifyContent="space-between"
                                                            sx={{
                                                                py: 0.5,
                                                                cursor: 'pointer',
                                                                userSelect: 'none',
                                                                '&:hover': { color: 'primary.main' },
                                                            }}
                                                        >
                                                            <Stack direction="row" alignItems="center" spacing={0.5} onClick={() => toggleGroupExpand(group.id)}>
                                                                <IconButton size="small" sx={{ p: 0.2 }}>
                                                                    {group.expanded ? (
                                                                        <KeyboardArrowDownIcon fontSize="small" />
                                                                    ) : (
                                                                        <KeyboardArrowRightIcon fontSize="small" />
                                                                    )}
                                                                </IconButton>
                                                                <DragIndicatorIcon fontSize="small" sx={{ color: '#94a3b8', fontSize: 16 }} />
                                                                <FolderOutlinedIcon fontSize="small" sx={{ color: '#64748b', ml: 0.5 }} />
                                                                <Typography variant="body2" fontWeight={600} color="#334155">
                                                                    {group.name}
                                                                </Typography>
                                                            </Stack>
                                                            <IconButton size="small" color="error" onClick={() => handleRemoveGroup(group.id)}>
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Stack>

                                                        {/* Group Attributes List */}
                                                        <Collapse in={group.expanded} timeout="auto" unmountOnExit>
                                                            <Stack spacing={0.5} sx={{ pl: 4, pt: 0.5, pb: 1 }}>
                                                                {group.attributes.map((attr) => (
                                                                    <Stack
                                                                        key={attr.id}
                                                                        draggable
                                                                        onDragStart={() => setDraggedAttr(attr)}
                                                                        direction="row"
                                                                        alignItems="center"
                                                                        justifyContent="space-between"
                                                                        sx={{
                                                                            py: 0.5,
                                                                            px: 1,
                                                                            borderRadius: 1,
                                                                            cursor: 'grab',
                                                                            bgcolor: '#fff',
                                                                            border: '1px solid #e2e8f0',
                                                                            '&:hover': { bgcolor: '#f1f5f9' },
                                                                        }}
                                                                    >
                                                                        <Stack direction="row" alignItems="center" spacing={1}>
                                                                            <DragIndicatorIcon fontSize="small" sx={{ color: '#cbd5e1', fontSize: 16 }} />
                                                                            <Typography variant="body2" color="#475569" sx={{ fontSize: '0.85rem' }}>
                                                                                {attr.name || attr.code}
                                                                            </Typography>
                                                                        </Stack>
                                                                        <IconButton
                                                                            size="small"
                                                                            onClick={() => handleMoveAttributeToUnassigned(attr)}
                                                                            sx={{ color: '#94a3b8', '&:hover': { color: '#ef4444' } }}
                                                                        >
                                                                            <RemoveCircleOutlineIcon fontSize="small" sx={{ fontSize: 16 }} />
                                                                        </IconButton>
                                                                    </Stack>
                                                                ))}
                                                                {group.attributes.length === 0 && (
                                                                    <Typography variant="caption" color="text.secondary" sx={{ pl: 1, fontStyle: 'italic' }}>
                                                                        Drop attribute here
                                                                    </Typography>
                                                                )}
                                                            </Stack>
                                                        </Collapse>
                                                    </Box>
                                                ))}
                                            </Stack>
                                        )}
                                    </Box>
                                </Grid>

                                {/* Unassigned Attributes list Drop Area */}
                                <Grid item xs={12} sm={6}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                        <Typography variant="subtitle2" fontWeight={700} color="#334155">
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
                                                endAdornment: <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />,
                                            }}
                                            sx={{ width: 100 }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
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
                                            bgcolor: '#fff',
                                            p: 1,
                                            borderRadius: 2,
                                            border: '1px dashed transparent',
                                            '&:hover': { border: '1px dashed #7c3aed', bgcolor: '#faf5ff' },
                                        }}
                                    >
                                        <List dense disablePadding>
                                            {filteredUnassigned.map((attr) => (
                                                <ListItem
                                                    key={attr.id}
                                                    draggable
                                                    onDragStart={() => setDraggedAttr(attr)}
                                                    sx={{
                                                        py: 0.8,
                                                        px: 1,
                                                        mb: 0.5,
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: 1,
                                                        bgcolor: '#fff',
                                                        '&:hover': { bgcolor: '#f8fafc', borderColor: '#7c3aed' },
                                                        cursor: 'grab',
                                                    }}
                                                    onClick={() => {
                                                        if (assignedGroups.length > 0) {
                                                            handleMoveAttributeToGroup(attr, assignedGroups[0].id);
                                                        }
                                                    }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 28, color: '#cbd5e1' }}>
                                                        <DragIndicatorIcon fontSize="small" sx={{ fontSize: 16 }} />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={attr.name || attr.code}
                                                        primaryTypographyProps={{ variant: 'body2', color: '#475569', fontSize: '0.85rem' }}
                                                    />
                                                </ListItem>
                                            ))}
                                            {filteredUnassigned.length === 0 && (
                                                <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block', textAlign: 'center' }}>
                                                    Drop here to unassign attributes.
                                                </Typography>
                                            )}
                                        </List>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>

                    {/* Right Column: General & Label panels */}
                    <Grid item xs={12} md={4}>
                        <Stack spacing={3}>
                            {/* General Panel */}
                            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                                <Typography variant="h6" fontWeight={700} color="#1e1b4b" sx={{ mb: 2 }}>
                                    General
                                </Typography>
                                <TextField
                                    label="Code *"
                                    required
                                    fullWidth
                                    size="small"
                                    placeholder="Enter Code"
                                    value={data.code}
                                    onChange={(e) => setData('code', e.target.value)}
                                    error={Boolean(errors.code)}
                                    helperText={errors.code}
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
            </Box>

            {/* Assign Attribute Group Dialog */}
            <Dialog
                open={assignDialogOpen}
                onClose={() => setAssignDialogOpen(false)}
                fullWidth
                maxWidth="xs"
                PaperProps={{ sx: { borderRadius: 2 } }}
            >
                <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight={700} color="#1e1b4b">
                        Assign Attribute Group
                    </Typography>
                    <IconButton onClick={() => setAssignDialogOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3 }}>
                    <Typography variant="body2" fontWeight={600} color="#334155" sx={{ mb: 1 }}>
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
                        sx={{
                            bgcolor: 'primary.main',
                            color: '#fff',
                            '&:hover': { bgcolor: 'primary.dark' },
                            fontWeight: 700,
                            borderRadius: 1.5,
                            px: 2.5,
                            textTransform: 'none',
                        }}
                    >
                        Assign Attribute Group
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
