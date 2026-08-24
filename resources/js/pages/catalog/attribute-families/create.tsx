import LocaleLabelFields from '@/components/catalog/locale-label-fields';
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
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
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

interface AssignedGroup {
    id: number;
    code: string;
    name: string;
    attributes: AttributeItem[];
    expanded: boolean;
}

interface Props {
    groups: AttributeGroup[];
    attributes: AttributeItem[];
}

export default function AttributeFamilyCreate({ groups, attributes }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributeFamilies'), href: '/catalog/attributeFamilies' },
        { title: t('createAttributeFamily'), href: '/catalog/attributeFamilies/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        group_attributes: [] as { attribute_id: number; attribute_group_id: number }[],
    });

    const [attrSearch, setAttrSearch] = useState('');
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<number | string>('');
    const [assignedGroups, setAssignedGroups] = useState<AssignedGroup[]>([]);
    const [unassignedAttrs, setUnassignedAttrs] = useState<AttributeItem[]>(attributes);
    const [draggedAttr, setDraggedAttr] = useState<AttributeItem | null>(null);
    const [noGroupWarningOpen, setNoGroupWarningOpen] = useState(false);

    // Group/attribute assignment lives in local state (assignedGroups) above,
    // not in useForm's data, so isDirty alone would miss drag-and-drop-only
    // changes — starting from empty on this Create page, any assigned group
    // is itself a sign of real, losable progress.
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty || assignedGroups.length > 0);

    // Dragging (or clicking) an attribute only means anything once at least
    // one group exists to receive it — with none yet, there's nowhere to
    // drop it at all (the group column just shows the empty-state
    // placeholder). Warn instead of letting the drag/click silently do
    // nothing, which otherwise looks like a bug rather than a missing step.
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

    const submit = (e: FormEvent) => {
        e.preventDefault();

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
        router.post('/catalog/attributeFamilies', {
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
            <Head title={t('createAttributeFamily')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        {t('createAttributeFamily')}
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/catalog/attributeFamilies"
                            variant="outlined"
                            sx={fioriDefaultSx}
                        >
                            {t('back')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={{ ...fioriEmphasizedSx, px: 2.5 }}
                        >
                            {processing ? t('saving') : t('saveAttributeFamily')}
                        </Button>
                    </Stack>
                </Stack>

                <Grid container spacing={3}>
                    {/* Left Column: Groups & Unassigned Attributes */}
                    <Grid item xs={12} md={8}>
                        <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                <Box>
                                    <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                        {tNav('attributeGroups')}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                        {t('attributeGroupsPanelSubtitle')}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1.5}>
                                    <Button
                                        onClick={handleDeleteAllGroups}
                                        sx={{ ...fioriGhostSx, color: FIORI.error }}
                                    >
                                        {t('deleteGroup')}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={() => setAssignDialogOpen(true)}
                                        sx={fioriDefaultSx}
                                    >
                                        {t('assignAttributeGroup')}
                                    </Button>
                                </Stack>
                            </Stack>

                            <Grid container spacing={3} sx={{ mt: 1 }}>
                                {/* Main Column section */}
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="subtitle2" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 1.5 }}>
                                        {t('mainColumn')}
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
                                            <Box sx={{ border: `1px dashed ${FIORI.border}`, borderRadius: '8px', p: 4, textAlign: 'center' }}>
                                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                                    {t('noGroupsAssignedYet')}
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
                                                            '&:hover': { border: `1px dashed ${FIORI.brand}`, bgcolor: FIORI.selected },
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
                                                                '&:hover': { color: FIORI.brand },
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
                                                                <DragIndicatorIcon fontSize="small" sx={{ color: FIORI.textSecondary, fontSize: 16 }} />
                                                                <FolderOutlinedIcon fontSize="small" sx={{ color: FIORI.textSecondary, ml: 0.5 }} />
                                                                <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
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
                                                                            bgcolor: FIORI.surface,
                                                                            border: `1px solid ${FIORI.border}`,
                                                                            '&:hover': { bgcolor: FIORI.hover },
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
                                                                {group.attributes.length === 0 && (
                                                                    <Typography variant="caption" color="text.secondary" sx={{ pl: 1, fontStyle: 'italic' }}>
                                                                        {t('dropAttributeHere')}
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
                                        <Typography variant="subtitle2" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                            {t('unassignedAttributes')}
                                        </Typography>
                                        <TextField
                                            value={attrSearch}
                                            onChange={(e) => setAttrSearch(e.target.value)}
                                            size="small"
                                            variant="standard"
                                            placeholder={t('search')}
                                            InputProps={{
                                                disableUnderline: true,
                                                endAdornment: <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />,
                                            }}
                                            sx={{ width: 100 }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block', mb: 1.5 }}>
                                        {t('dragAttributeToUnassign')}
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
                                                        handleMoveAttributeToGroup(attr, assignedGroups[0].id);
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
                                                    {t('dropHereToUnassign')}
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
                            <LocaleLabelFields
                                title={t('labelTitle')}
                                values={data.translations}
                                onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                            />
                        </Stack>
                    </Grid>
                </Grid>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 3 }}>
                        {t('correctHighlightedFields')}
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
                    <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        {t('assignAttributeGroup')}
                    </Typography>
                    <IconButton onClick={() => setAssignDialogOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 3 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary, mb: 1 }}>
                        {t('groupsRequired')}
                    </Typography>
                    <FormControl fullWidth size="small">
                        <Select
                            displayEmpty
                            value={selectedGroupId}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                            renderValue={(selected) => {
                                if (!selected) {
                                    return <Typography color="text.secondary">{t('selectOption')}</Typography>;
                                }
                                const g = groups.find((item) => item.id === Number(selected));
                                return g ? (g.name || g.code) : String(selected);
                            }}
                        >
                            <MenuItem value="" disabled>
                                {t('selectOption')}
                            </MenuItem>
                            {groups.map((grp) => (
                                <MenuItem key={grp.id} value={grp.id}>
                                    {grp.name || grp.code}
                                </MenuItem>
                            ))}
                            {groups.length === 0 && (
                                <MenuItem value="" disabled>
                                    {t('noAttributeGroupsAvailable')}
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
                        {t('assignAttributeGroup')}
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
