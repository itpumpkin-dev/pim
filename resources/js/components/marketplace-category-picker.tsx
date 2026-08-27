import { FIORI, FIORI_RAW, fioriDefaultSx, fioriEmphasizedSx, fioriSearchFieldSx } from '@/lib/fiori-style';
import { UI_BORDER, UI_BORDER_STRONG } from '@/lib/ui-style';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ClearIcon from '@mui/icons-material/Clear';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type MarketplacePlatform = 'shopee' | 'lazada' | 'tiktok' | 'woocommerce';

interface MarketplaceCategoryNode {
    id: number;
    name: string;
    is_leaf: boolean;
}

interface PathNode {
    id: number;
    name: string;
}

interface SearchResult {
    id: number;
    name: string;
    parent_name: string | null;
}

function fetchChildren(platform: MarketplacePlatform, parentId: number | null): Promise<MarketplaceCategoryNode[]> {
    const qs = parentId ? `?parent_id=${parentId}` : '';
    return fetch(`/catalog/marketplace-categories/${platform}/children${qs}`, { headers: { Accept: 'application/json' } }).then((res) =>
        res.ok ? res.json() : [],
    );
}

function fetchPath(platform: MarketplacePlatform, id: number): Promise<PathNode[]> {
    return fetch(`/catalog/marketplace-categories/${platform}/path?id=${id}`, { headers: { Accept: 'application/json' } }).then((res) =>
        res.ok ? res.json() : [],
    );
}

/**
 * Per-product override picker for a single marketplace's category — mirrors
 * CategoryCascadeSelect's Shopee-style dialog UX, but browses that
 * marketplace's own synced tree (shopee_categories/lazada_categories/
 * tiktok_categories/woocommerce_categories — thousands of rows each, see CategoryController::
 * marketplaceCategoryChildren()'s docblock) directly instead of the PIM's
 * own ~1,100-node tree. Loads one level at a time on demand rather than the
 * whole tree at once, since these are too large to ship as one nested JSON
 * blob the way the PIM tree is.
 *
 * `value`/`onChange` carry a marketplace-category id (or null to clear the
 * override) — see Shopee/Lazada/TikTok/WooCommerceProductSyncService::
 * resolve*CategoryId(), which prefer this per-product value over the
 * shared, category-level default when set.
 *
 * `disabled` locks the trigger (no dialog, no clear button) without
 * touching `value` — used when the product's Edit page has a product-wide
 * "System Categories" vs "Marketplace Categories" switch and this platform
 * isn't the active side of it, so an existing override stays visible but
 * isn't editable until the switch flips back.
 */
export function MarketplaceCategoryPicker({
    platform,
    label,
    value,
    onChange,
    disabled,
}: {
    platform: MarketplacePlatform;
    label: string;
    value: number | null;
    onChange: (id: number | null) => void;
    disabled?: boolean;
}) {
    const { t } = useTranslation('catalog');
    const [currentPath, setCurrentPath] = useState<PathNode[]>([]);
    const [loadingCurrent, setLoadingCurrent] = useState(false);

    useEffect(() => {
        if (!value) {
            setCurrentPath([]);
            return;
        }
        setLoadingCurrent(true);
        fetchPath(platform, value)
            .then(setCurrentPath)
            .finally(() => setLoadingCurrent(false));
    }, [platform, value]);

    const [open, setOpen] = useState(false);
    const [columns, setColumns] = useState<MarketplaceCategoryNode[][]>([]);
    const [selectedPath, setSelectedPath] = useState<{ id: number; name: string; is_leaf: boolean }[]>([]);
    const [loadingLevel, setLoadingLevel] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!open) return;
        const q = search.trim();
        if (q === '') {
            setSearchResults([]);
            return;
        }
        setSearching(true);
        const timer = setTimeout(() => {
            fetch(`/catalog/marketplace-categories/${platform}/search?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : []))
                .then(setSearchResults)
                .finally(() => setSearching(false));
        }, 300);
        return () => clearTimeout(timer);
    }, [open, platform, search]);

    const openPicker = async () => {
        setOpen(true);
        setSearch('');
        setSearchResults([]);
        setLoadingLevel(0);
        try {
            if (value) {
                const path = await fetchPath(platform, value);
                const cols: MarketplaceCategoryNode[][] = [];
                const selected: { id: number; name: string; is_leaf: boolean }[] = [];
                let parentId: number | null = null;
                for (const node of path) {
                    const kids = await fetchChildren(platform, parentId);
                    cols.push(kids);
                    const matched = kids.find((k) => k.id === node.id);
                    selected.push({ id: node.id, name: node.name, is_leaf: matched?.is_leaf ?? true });
                    parentId = node.id;
                }
                const lastKids = await fetchChildren(platform, parentId);
                if (lastKids.length > 0) cols.push(lastKids);
                setColumns(cols);
                setSelectedPath(selected);
            } else {
                const rootKids = await fetchChildren(platform, null);
                setColumns([rootKids]);
                setSelectedPath([]);
            }
        } finally {
            setLoadingLevel(null);
        }
    };

    const selectAt = async (level: number, node: MarketplaceCategoryNode) => {
        setSelectedPath((prev) => [...prev.slice(0, level), { id: node.id, name: node.name, is_leaf: node.is_leaf }]);
        setColumns((prev) => prev.slice(0, level + 1));

        if (node.is_leaf) return;

        setLoadingLevel(level + 1);
        try {
            const kids = await fetchChildren(platform, node.id);
            setColumns((prev) => [...prev.slice(0, level + 1), kids]);
        } finally {
            setLoadingLevel(null);
        }
    };

    const selectFromSearch = (result: SearchResult) => {
        setSelectedPath([{ id: result.id, name: result.name, is_leaf: true }]);
        setColumns([]);
        setSearch('');
    };

    const lastSelected = selectedPath[selectedPath.length - 1];
    const canConfirm = Boolean(lastSelected?.is_leaf);

    const handleConfirm = () => {
        if (!canConfirm) return;
        onChange(lastSelected.id);
        setOpen(false);
    };

    const clearValue = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(null);
    };

    return (
        <Stack spacing={0.5}>
            <Typography variant="caption" fontWeight={600} color="#334155">
                {label}
            </Typography>
            <Box
                onClick={disabled ? undefined : openPicker}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    px: 1.5,
                    py: 1,
                    border: `1px solid ${UI_BORDER_STRONG}`,
                    borderRadius: 1,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    bgcolor: disabled ? 'action.disabledBackground' : 'transparent',
                    '&:hover': disabled ? undefined : { borderColor: FIORI.brand },
                }}
            >
                <Typography
                    variant="body2"
                    color={loadingCurrent || currentPath.length === 0 ? 'text.disabled' : 'text.primary'}
                    sx={{ fontStyle: !loadingCurrent && currentPath.length === 0 ? 'italic' : 'normal' }}
                >
                    {loadingCurrent
                        ? t('loadingEllipsis')
                        : currentPath.length > 0
                          ? currentPath.map((n) => n.name).join(' > ')
                          : t('notSetClickToSelectPlatformCategory', { platform: label })}
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    {!disabled && currentPath.length > 0 && (
                        <IconButton size="small" onClick={clearValue} title={t('clearValue')}>
                            <ClearIcon fontSize="small" />
                        </IconButton>
                    )}
                    <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                </Stack>
            </Box>

            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {t('selectPlatformCategoryDialogTitle', { platform: label })}
                    <IconButton size="small" onClick={() => setOpen(false)}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    <Box sx={{ p: 2, borderBottom: `1px solid ${UI_BORDER}` }}>
                        <TextField
                            size="small"
                            fullWidth
                            placeholder={t('categorySearchPlaceholder')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                            sx={fioriSearchFieldSx}
                        />
                    </Box>

                    {search.trim() !== '' ? (
                        <Box sx={{ maxHeight: 360, overflowY: 'auto' }}>
                            {searching ? (
                                <Stack alignItems="center" sx={{ p: 3 }}>
                                    <CircularProgress size={24} />
                                </Stack>
                            ) : searchResults.length === 0 ? (
                                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                    {t('noCategoryMatching', { query: search })}
                                </Typography>
                            ) : (
                                searchResults.map((result) => (
                                    <Box
                                        key={result.id}
                                        onClick={() => selectFromSearch(result)}
                                        sx={{ px: 2, py: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                                    >
                                        <Typography variant="body2">{result.name}</Typography>
                                        {result.parent_name && (
                                            <Typography variant="caption" color="text.secondary">
                                                {result.parent_name}
                                            </Typography>
                                        )}
                                    </Box>
                                ))
                            )}
                        </Box>
                    ) : loadingLevel === 0 && columns.length === 0 ? (
                        <Stack alignItems="center" justifyContent="center" sx={{ height: 360 }}>
                            <CircularProgress size={24} />
                        </Stack>
                    ) : (
                        <Stack direction="row" sx={{ height: 360 }}>
                            {columns.map((nodes, level) => (
                                <Box
                                    key={level}
                                    sx={{ width: 220, flexShrink: 0, overflowY: 'auto', borderRight: `1px solid ${UI_BORDER}`, '&:last-child': { borderRight: 'none' } }}
                                >
                                    {nodes.map((node) => {
                                        const isSelected = node.id === selectedPath[level]?.id;
                                        return (
                                            <Box
                                                key={node.id}
                                                onClick={() => selectAt(level, node)}
                                                sx={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 1,
                                                    px: 2,
                                                    py: 1,
                                                    cursor: 'pointer',
                                                    bgcolor: isSelected ? FIORI_RAW.brand + '1a' : 'transparent',
                                                    color: isSelected ? FIORI.brand : 'text.primary',
                                                    fontWeight: isSelected ? 700 : 400,
                                                    '&:hover': { bgcolor: isSelected ? FIORI_RAW.brand + '1a' : 'action.hover' },
                                                }}
                                            >
                                                <Typography variant="body2" sx={{ fontWeight: 'inherit', color: 'inherit' }}>
                                                    {node.name}
                                                </Typography>
                                                {!node.is_leaf && <ChevronRightIcon fontSize="small" sx={{ color: isSelected ? FIORI.brand : 'text.disabled' }} />}
                                            </Box>
                                        );
                                    })}
                                </Box>
                            ))}
                            {loadingLevel !== null && loadingLevel > 0 && (
                                <Stack alignItems="center" justifyContent="center" sx={{ width: 220, flexShrink: 0 }}>
                                    <CircularProgress size={20} />
                                </Stack>
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}>
                    <Typography variant="caption" color={canConfirm ? 'text.secondary' : 'error'}>
                        {selectedPath.length > 0
                            ? selectedPath.map((n) => n.name).join(' > ') + (canConfirm ? '' : ` — ${t('selectDownToMostSpecificCategory')}`)
                            : '—'}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button onClick={() => setOpen(false)} sx={fioriDefaultSx}>
                            {t('cancel')}
                        </Button>
                        <Button variant="contained" onClick={handleConfirm} disabled={!canConfirm} sx={fioriEmphasizedSx}>
                            {t('confirm')}
                        </Button>
                    </Stack>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
