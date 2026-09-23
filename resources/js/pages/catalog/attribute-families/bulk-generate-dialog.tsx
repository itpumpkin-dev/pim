import { FIORI, fioriEmphasizedSx, fioriGhostSx } from '@/lib/fiori-style';
import { router } from '@inertiajs/react';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import SearchIcon from '@mui/icons-material/Search';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    IconButton,
    InputLabel,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProductGroupPickerItem {
    id: number;
    name: string;
    subcategory_name: string | null;
    category_name: string | null;
}

interface ProductGroupPickerResponse {
    data: ProductGroupPickerItem[];
    current_page: number;
    last_page: number;
    total: number;
}

interface OtherFamily {
    id: number;
    code: string;
    name?: string;
}

/**
 * "สร้างตามกลุ่มสินค้า" — bulk-creates one Attribute Family per selected
 * Product Group, named from $namePattern (the literal token "{name}" is
 * replaced with the group's own name), optionally cloning another family's
 * groups/attributes into every one created. Mirrors the "assign default
 * family to selected Product Groups" picker on edit.tsx (same search/page/
 * checkbox-list shape) — but lists every Product Group regardless of
 * whether it already has a family: the new one is appended after whatever
 * it already has (see AttributeFamilyBulkGenerator), never replacing its
 * existing default.
 */
export function BulkGenerateDialog({ open, onClose, otherFamilies }: { open: boolean; onClose: () => void; otherFamilies: OtherFamily[] }) {
    const { t } = useTranslation('catalog');

    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pickerData, setPickerData] = useState<ProductGroupPickerResponse | null>(null);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [namePattern, setNamePattern] = useState('สเปค-{name}');
    const [templateFamilyId, setTemplateFamilyId] = useState<number | ''>('');
    const [submitting, setSubmitting] = useState(false);
    const [selectAllLoading, setSelectAllLoading] = useState(false);

    useEffect(() => {
        if (!open) return undefined;

        setPickerLoading(true);
        const params = new URLSearchParams({ page: String(page), per_page: '15' });
        if (search.trim()) params.set('search', search.trim());

        const controller = new AbortController();
        fetch(`/catalog/attributeFamilies/product-groups-for-bulk-generate?${params}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => res.json())
            .then((json: ProductGroupPickerResponse) => setPickerData(json))
            .catch((err) => {
                if (err.name !== 'AbortError') setPickerData(null);
            })
            .finally(() => setPickerLoading(false));

        return () => controller.abort();
    }, [open, search, page]);

    // ค้นหาใหม่ -> กลับไปหน้า 1 เสมอ (หน้าเดิมอาจไม่มีอยู่แล้วในผลลัพธ์ใหม่)
    useEffect(() => {
        setPage(1);
    }, [search]);

    const toggleSelected = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // ดึง id ของกลุ่มสินค้าที่ตรงกับคำค้นปัจจุบัน "ทุกหน้า" มาเลือกทีเดียว — ไม่
    // ทับตัวที่เลือกไว้ก่อนหน้าจากคำค้นอื่น (union เข้าไป เหมือนติ๊กทีละแถว)
    const selectAllMatching = () => {
        if (selectAllLoading) return;

        setSelectAllLoading(true);
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());

        fetch(`/catalog/attributeFamilies/product-groups-for-bulk-generate/ids?${params}`, { headers: { Accept: 'application/json' } })
            .then((res) => res.json())
            .then((json: { ids: number[] }) => {
                setSelectedIds((prev) => new Set([...prev, ...json.ids]));
            })
            .finally(() => setSelectAllLoading(false));
    };

    const clearSelection = () => setSelectedIds(new Set());

    const reset = () => {
        setSearch('');
        setPage(1);
        setPickerData(null);
        setSelectedIds(new Set());
        setNamePattern('สเปค-{name}');
        setTemplateFamilyId('');
    };

    const handleClose = () => {
        onClose();
        reset();
    };

    const previewNames = useMemo(() => {
        if (!pickerData) return [];
        return pickerData.data
            .filter((g) => selectedIds.has(g.id))
            .slice(0, 3)
            .map((g) => namePattern.replace('{name}', g.name));
    }, [pickerData, selectedIds, namePattern]);

    const canSubmit = selectedIds.size > 0 && namePattern.includes('{name}') && !submitting;

    const handleSubmit = () => {
        if (!canSubmit) return;

        setSubmitting(true);
        router.post(
            '/catalog/attributeFamilies/bulk-generate',
            {
                category_ids: Array.from(selectedIds),
                name_pattern: namePattern,
                template_family_id: templateFamilyId === '' ? null : templateFamilyId,
            },
            {
                preserveScroll: true,
                onSuccess: () => handleClose(),
                onFinish: () => setSubmitting(false),
            },
        );
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" PaperProps={{ sx: { height: '85vh', borderRadius: 2 } }}>
            <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                    {t('generateFromProductGroupsDialogTitle')}
                </Typography>
                <IconButton onClick={handleClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 2, borderBottom: `1px solid ${FIORI.border}` }}>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, mb: 1.5 }}>
                        {t('generateFromProductGroupsHelp')}
                    </Typography>

                    <TextField
                        fullWidth
                        size="small"
                        label={t('namePatternLabel')}
                        value={namePattern}
                        onChange={(e) => setNamePattern(e.target.value)}
                        helperText={t('namePatternHelp')}
                        sx={{ mb: 2 }}
                    />

                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                        <InputLabel id="bulk-generate-template-label">{t('startFromTemplateLabel')}</InputLabel>
                        <Select
                            labelId="bulk-generate-template-label"
                            label={t('startFromTemplateLabel')}
                            value={templateFamilyId}
                            onChange={(e) => setTemplateFamilyId(e.target.value === '' ? '' : Number(e.target.value))}
                        >
                            <MenuItem value="">
                                <em>{t('startFromTemplateEmpty')}</em>
                            </MenuItem>
                            {otherFamilies.map((f) => (
                                <MenuItem key={f.id} value={f.id}>
                                    {f.name || f.code} ({f.code})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {previewNames.length > 0 && (
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                            {previewNames.map((name) => (
                                <Chip key={name} label={name} size="small" sx={{ bgcolor: FIORI.brandBg, color: FIORI.brandDark, fontWeight: 600 }} />
                            ))}
                            {selectedIds.size > previewNames.length && (
                                <Chip label={`+${selectedIds.size - previewNames.length}`} size="small" variant="outlined" />
                            )}
                        </Stack>
                    )}

                    <TextField
                        fullWidth
                        size="small"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('search')}
                        InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary, mr: 1 }} /> }}
                    />

                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1 }}>
                        <Button
                            size="small"
                            onClick={selectAllMatching}
                            disabled={selectAllLoading || !pickerData || pickerData.total === 0}
                            startIcon={selectAllLoading ? <CircularProgress size={12} /> : undefined}
                            sx={{ textTransform: 'none', minWidth: 0, p: 0, color: FIORI.brand }}
                        >
                            {t('selectAllMatching', { count: pickerData?.total ?? 0 })}
                        </Button>
                        {selectedIds.size > 0 && (
                            <Button
                                size="small"
                                onClick={clearSelection}
                                sx={{ textTransform: 'none', minWidth: 0, p: 0, color: FIORI.textSecondary }}
                            >
                                {t('clearSelection')}
                            </Button>
                        )}
                    </Stack>

                    {selectedIds.size > 0 && (
                        <Typography variant="caption" sx={{ color: FIORI.brand, display: 'block', mt: 1 }}>
                            {t('selectedGroupsCount', { count: selectedIds.size })}
                        </Typography>
                    )}
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    {pickerLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : !pickerData || pickerData.data.length === 0 ? (
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, textAlign: 'center', p: 4 }}>
                            {t('noProductGroupsFound')}
                        </Typography>
                    ) : (
                        <List dense disablePadding>
                            {pickerData.data.map((group) => (
                                <ListItem
                                    key={group.id}
                                    onClick={() => toggleSelected(group.id)}
                                    sx={{ py: 1, px: 2, cursor: 'pointer', '&:hover': { bgcolor: FIORI.hover } }}
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <Checkbox edge="start" size="small" checked={selectedIds.has(group.id)} tabIndex={-1} disableRipple />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={group.name}
                                        secondary={[group.category_name, group.subcategory_name].filter(Boolean).join(' / ')}
                                        primaryTypographyProps={{ variant: 'body2', sx: { color: FIORI.textPrimary } }}
                                        secondaryTypographyProps={{ variant: 'caption' }}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Box>

                {pickerData && pickerData.last_page > 1 && (
                    <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ p: 1.5, borderTop: `1px solid ${FIORI.border}` }}>
                        <IconButton size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                            <KeyboardArrowLeftIcon fontSize="small" />
                        </IconButton>
                        <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                            {pickerData.current_page} / {pickerData.last_page}
                        </Typography>
                        <IconButton size="small" disabled={page >= pickerData.last_page} onClick={() => setPage((p) => p + 1)}>
                            <KeyboardArrowRightIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={handleClose} sx={fioriGhostSx}>
                    {t('cancel')}
                </Button>
                <Button
                    variant="contained"
                    disabled={!canSubmit}
                    startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : undefined}
                    onClick={handleSubmit}
                    sx={{ ...fioriEmphasizedSx, px: 2.5 }}
                >
                    {t('bulkGenerateSubmit')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
