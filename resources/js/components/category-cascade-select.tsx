import { FIORI, FIORI_RAW, fioriDefaultSx, fioriEmphasizedSx, fioriSearchFieldSx } from '@/lib/fiori-style';
import { UI_BORDER, UI_BORDER_STRONG } from '@/lib/ui-style';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import {
    Box,
    Button,
    Chip,
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
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface CategoryNode {
    id: number;
    code: string;
    name: string;
    mapped_platforms?: string[];
    children: CategoryNode[];
}

// Display label for each mapped_platforms value — just casing, no color/chip
// per platform anymore (see this file's git history for why that per-level
// breakdown was removed): keeping this as plain text next to the count is
// enough to answer "which ones" without reintroducing the root/หมวดย่อยสินค้า
// confusion a full chip-per-level display caused.
const PLATFORM_LABELS: Record<string, string> = {
    lazada: 'Lazada',
    shopee: 'Shopee',
    tiktok: 'TikTok',
    woocommerce: 'WooCommerce',
};

/**
 * Only the deepest selected level (กลุ่มสินค้า) is ever what marketplace
 * pushes actually read (ShopeeProductSyncService/LazadaProductSyncService/
 * TikTokProductSyncService all resolve category off $product->categories()
 * with no ordering — the only thing keeping that deterministic today is that
 * a product has at most one category per marketplace with a mapping at all,
 * which is only reliably true when root/หมวดย่อยสินค้า never carry a mapping
 * of their own). Showing a per-level chip breakdown here read as "root/
 * หมวดย่อยสินค้า should get mapped too, for consistency" — which is both
 * pointless (they're never read) and actively risky (see that docblock) — so
 * this only ever surfaces the one level that matters, not which of the three
 * levels it came from. The platform names themselves are still worth
 * showing (just as plain text, not per-platform chips) — the count alone
 * ("จับคู่แล้ว 2 แพลตฟอร์ม") doesn't say which 2.
 */
function mappedPlatformNames(node: CategoryNode | undefined): string[] {
    return (node?.mapped_platforms ?? []).map((p) => PLATFORM_LABELS[p] ?? p);
}

/** Root-to-node path (inclusive) if `targetId` exists somewhere in the tree, else null. */
function findPath(nodes: CategoryNode[], targetId: number): CategoryNode[] | null {
    for (const node of nodes) {
        if (node.id === targetId) return [node];
        const childPath = findPath(node.children, targetId);
        if (childPath) return [node, ...childPath];
    }
    return null;
}

/** Every node in the tree (any depth) paired with its own root-to-node path — used by the picker dialog's search box, which matches against names at any level, not just leaves. */
function flattenWithPaths(nodes: CategoryNode[], ancestors: CategoryNode[] = []): { node: CategoryNode; path: CategoryNode[] }[] {
    return nodes.flatMap((node) => {
        const path = [...ancestors, node];
        return [{ node, path }, ...flattenWithPaths(node.children, path)];
    });
}

/**
 * The "การผูก Marketplace: จับคู่แล้ว N แพลตฟอร์ม (...)" row — shared between
 * CategoryCascadeSelect (editable) and CategoryPathReadOnly (View Product)
 * below, so the two pages can't drift into showing this differently.
 */
function MarketplaceMappingSummary({ node }: { node: CategoryNode | undefined }) {
    const { t } = useTranslation('catalog');
    const names = mappedPlatformNames(node);

    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {t('marketplaceMappingLabel')}
            </Typography>
            {names.length > 0 ? (
                <>
                    <Chip
                        label={t('mappedToPlatformsCount', { count: names.length })}
                        size="small"
                        sx={{ bgcolor: FIORI.brand, color: '#fff', fontWeight: 600, height: 20, fontSize: 11 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                        ({names.join(', ')})
                    </Typography>
                </>
            ) : (
                <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                    {t('notMappedToAnyMarketplace')}
                </Typography>
            )}
        </Stack>
    );
}

/**
 * Read-only counterpart to CategoryCascadeSelect for View Product — same
 * tree fetch + deepest-path derivation, but rendered as a plain breadcrumb
 * (no dropdowns/onChange) since there's nothing to edit on a read page.
 */
export function CategoryPathReadOnly({ categoryIds }: { categoryIds: number[] }) {
    const { t } = useTranslation('catalog');
    const [tree, setTree] = useState<CategoryNode[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/catalog/categories/tree', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: CategoryNode[]) => setTree(data))
            .finally(() => setLoading(false));
    }, []);

    const currentPath = useMemo(() => {
        if (tree.length === 0 || categoryIds.length === 0) return [];

        let deepest: CategoryNode[] | null = null;
        for (const id of categoryIds) {
            const path = findPath(tree, id);
            if (path && (!deepest || path.length > deepest.length)) {
                deepest = path;
            }
        }
        return deepest ?? [];
    }, [tree, categoryIds]);

    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('loadingCategories')}
            </Typography>
        );
    }

    if (currentPath.length === 0) {
        return (
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                {t('categoryNotAssigned')}
            </Typography>
        );
    }

    return (
        <Stack spacing={1}>
            <Typography variant="body2" color="text.primary">
                {currentPath.map((n) => n.name).join(' > ')}
            </Typography>
            <MarketplaceMappingSummary node={currentPath[currentPath.length - 1]} />
        </Stack>
    );
}

/**
 * One column of the picker dialog below — the options available at a single
 * depth of the tree, with the current pick at that depth (if any) highlighted.
 */
function CategoryColumn({
    nodes,
    selectedId,
    onSelect,
}: {
    nodes: CategoryNode[];
    selectedId: number | undefined;
    onSelect: (node: CategoryNode) => void;
}) {
    return (
        <Box sx={{ width: 220, flexShrink: 0, overflowY: 'auto', borderRight: `1px solid ${UI_BORDER}`, '&:last-child': { borderRight: 'none' } }}>
            {nodes.map((node) => {
                const isSelected = node.id === selectedId;
                return (
                    <Box
                        key={node.id}
                        onClick={() => onSelect(node)}
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
                        {node.children.length > 0 && <ChevronRightIcon fontSize="small" sx={{ color: isSelected ? FIORI.brand : 'text.disabled' }} />}
                    </Box>
                );
            })}
        </Box>
    );
}

/**
 * Shopee-style multi-column category picker, opened from a dialog — replaces
 * the old three stacked dropdowns with a horizontal drill-down (browse a
 * column, pick a node, its children appear as the next column) plus a name
 * search across every depth, matching the seller-center UX admins already
 * know from Shopee. Still browses the PIM's own unified `categories` tree
 * (only 3 levels deep by construction — see CategoryTaxonomySeeder), not
 * Shopee's tree directly: every marketplace push (Shopee/Lazada/TikTok/
 * WooCommerce) resolves its own category off the *same* PIM category node
 * (see each platform's per-category mapping under Categories > Marketplace
 * Mapping), so keeping this picker on the PIM tree is what keeps a product's
 * category consistent across all of them — see
 * ProductCategoryLinker::deepestAncestorChain() for the backend counterpart
 * this mirrors.
 *
 * `value`/`onChange` still carry `category_ids` as an array for backward
 * compatibility with the save payload, but this component only ever
 * produces a single root-to-leaf path in it.
 */
export function CategoryCascadeSelect({
    value,
    onChange,
    disabled,
}: {
    value: number[];
    onChange: (ids: number[]) => void;
    /** เมื่อ true จะล็อกไม่ให้เปิด picker (แต่ไม่ล้างค่าที่เลือกไว้อยู่แล้ว) — ใช้เมื่อแอดมินเลือกโหมด "Marketplace Categories" แทนที่ System Categories สำหรับสินค้านี้ */
    disabled?: boolean;
}) {
    const { t } = useTranslation('catalog');
    const [tree, setTree] = useState<CategoryNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [pendingPath, setPendingPath] = useState<CategoryNode[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetch('/catalog/categories/tree', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: CategoryNode[]) => setTree(data))
            .finally(() => setLoading(false));
    }, []);

    // Whichever assigned id resolves to the longest path is the "current"
    // selection this cascade shows — same deepest-wins rule the backend
    // derivation uses, so what's displayed here matches what it acts on.
    const currentPath = useMemo(() => {
        if (tree.length === 0 || value.length === 0) return [];

        let deepest: CategoryNode[] | null = null;
        for (const id of value) {
            const path = findPath(tree, id);
            if (path && (!deepest || path.length > deepest.length)) {
                deepest = path;
            }
        }
        return deepest ?? [];
    }, [tree, value]);

    const searchResults = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (q === '') return [];
        return flattenWithPaths(tree).filter(({ node }) => node.name.toLowerCase().includes(q));
    }, [tree, search]);

    const openPicker = () => {
        setPendingPath(currentPath);
        setSearch('');
        setOpen(true);
    };

    // เลือก node ที่ depth ใดก็ตาม (0/1/2) จะตัดของที่เลือกไว้ลึกกว่านั้นทิ้ง
    // เสมอ (สาขาลูกของ node ใหม่ ไม่ใช่ของอันเดิม)
    const selectAt = (level: number, node: CategoryNode) => {
        setPendingPath((prev) => [...prev.slice(0, level), node]);
    };

    const selectFromSearch = (path: CategoryNode[]) => {
        setPendingPath(path);
        setSearch('');
    };

    // เก็บ id ของหมวดหมู่ในสาขาอื่นที่ผูกไว้แยกต่างหาก (เช่น สินค้าถูกจัดเข้า
    // สาขาที่ไม่เกี่ยวข้องกันสองสาขา — ดู ProductCategoryLinker::linkFromCodes)
    // ไว้เหมือนเดิม ไม่แตะ — picker นี้แก้แค่ path เดียวของตัวเองเท่านั้น
    const handleConfirm = () => {
        const pathIds = new Set(currentPath.map((n) => n.id));
        const otherBranchIds = value.filter((id) => !pathIds.has(id));
        onChange([...otherBranchIds, ...pendingPath.map((n) => n.id)]);
        setOpen(false);
    };

    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary">
                {t('loadingCategories')}
            </Typography>
        );
    }

    return (
        <Stack spacing={1.5}>
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
                <Typography variant="body2" color={currentPath.length > 0 ? 'text.primary' : 'text.disabled'} sx={{ fontStyle: currentPath.length > 0 ? 'normal' : 'italic' }}>
                    {currentPath.length > 0 ? currentPath.map((n) => n.name).join(' > ') : t('noCategorySelectedClickToSelect')}
                </Typography>
                <ChevronRightIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            </Box>

            {currentPath.length > 0 && <MarketplaceMappingSummary node={currentPath[currentPath.length - 1]} />}

            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {t('editProductCategoryDialogTitle')}
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
                            {searchResults.length === 0 ? (
                                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                    {t('noCategoryMatching', { query: search })}
                                </Typography>
                            ) : (
                                searchResults.map(({ node, path }) => (
                                    <Box
                                        key={node.id}
                                        onClick={() => selectFromSearch(path)}
                                        sx={{ px: 2, py: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                                    >
                                        <Typography variant="body2">{node.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {path.map((n) => n.name).join(' > ')}
                                        </Typography>
                                    </Box>
                                ))
                            )}
                        </Box>
                    ) : (
                        <Stack direction="row" sx={{ height: 360 }}>
                            <CategoryColumn nodes={tree} selectedId={pendingPath[0]?.id} onSelect={(node) => selectAt(0, node)} />
                            {pendingPath[0] && (
                                <CategoryColumn nodes={pendingPath[0].children} selectedId={pendingPath[1]?.id} onSelect={(node) => selectAt(1, node)} />
                            )}
                            {pendingPath[1] && (
                                <CategoryColumn nodes={pendingPath[1].children} selectedId={pendingPath[2]?.id} onSelect={(node) => selectAt(2, node)} />
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                        {t('currentlySelected')}{' '}
                        {pendingPath.length > 0 ? pendingPath.map((n) => n.name).join(' > ') : '—'}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button onClick={() => setOpen(false)} sx={fioriDefaultSx}>
                            {t('cancel')}
                        </Button>
                        <Button variant="contained" onClick={handleConfirm} disabled={pendingPath.length === 0} sx={fioriEmphasizedSx}>
                            {t('confirm')}
                        </Button>
                    </Stack>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
