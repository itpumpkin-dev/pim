import { Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { PALETTE } from '@/theme';

interface CategoryNode {
    id: number;
    code: string;
    name: string;
    mapped_platforms?: string[];
    children: CategoryNode[];
}

// Same 4-color rotation as categories/index.tsx's MAPPED_PLATFORMS /
// marketplace-sync.tsx's PLATFORM_ACCENT_COLORS (Lazada, Shopee, TikTok,
// WooCommerce) — kept as its own copy here rather than importing from the
// list page, same "small enough to duplicate" precedent that pairing
// already follows.
const MAPPED_PLATFORMS: { value: string; label: string; color: string }[] = [
    { value: 'lazada', label: 'Lazada', color: PALETTE.accent },
    { value: 'shopee', label: 'Shopee', color: PALETTE.highlight },
    { value: 'tiktok', label: 'TikTok', color: PALETTE.primary },
    { value: 'woocommerce', label: 'WooCommerce', color: PALETTE.secondary },
];

const LEVEL_LABELS = ['หมวดหมู่สินค้า', 'หมวดย่อยสินค้า', 'กลุ่มสินค้า'];

/** Small chip strip showing which marketplace(s) one selected category level is mapped to. */
function MappedPlatformsRow({ node }: { node: CategoryNode }) {
    const mapped = node.mapped_platforms ?? [];

    return (
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ pl: 0.5 }}>
            {mapped.length > 0 ? (
                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {MAPPED_PLATFORMS.filter((p) => mapped.includes(p.value)).map((p) => (
                        <Chip
                            key={p.value}
                            label={p.label}
                            size="small"
                            sx={{ bgcolor: p.color, color: '#fff', fontWeight: 600, height: 20, fontSize: 11 }}
                        />
                    ))}
                </Stack>
            ) : (
                <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                    ยังไม่ผูก marketplace ใดๆ
                </Typography>
            )}
        </Stack>
    );
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

/**
 * Three cascading dropdowns (หมวดหมู่สินค้า / หมวดย่อยสินค้า / กลุ่มสินค้า)
 * over the real `categories` tree (only 3 levels deep by construction — see
 * CategoryTaxonomySeeder) — replaces the old multi-select checkbox tree
 * picker with the single-path selector the legacy ERP form used, since in
 * practice products are tagged at one path (root -> subcategory -> group);
 * see ProductCategoryLinker::deepestAncestorChain() for the backend
 * counterpart this mirrors.
 *
 * `value`/`onChange` still carry `category_ids` as an array for backward
 * compatibility with the save payload, but this component only ever
 * produces a single root-to-leaf path in it.
 */
export function CategoryCascadeSelect({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
    const [tree, setTree] = useState<CategoryNode[]>([]);
    const [loading, setLoading] = useState(true);

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

    const root = currentPath[0];
    const sub = currentPath[1];

    const subOptions = root?.children ?? [];
    const groupOptions = sub?.children ?? [];

    // Picking a value at a level drops whatever was picked below it (a new
    // root's subcategories aren't the old root's, etc.); clearing a level
    // (empty string) does the same, keeping only the levels above it. Any
    // assigned id that isn't part of the path shown here (e.g. a product
    // cross-listed into a second, unrelated branch — see
    // ProductCategoryLinker::linkFromCodes's own docblock on that being a
    // legitimate case) is preserved rather than silently dropped: this
    // cascade only ever edits its own single path.
    const selectLevel = (level: 0 | 1 | 2) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        const pathIds = new Set(currentPath.map((n) => n.id));
        const otherBranchIds = value.filter((id) => !pathIds.has(id));
        const kept = currentPath.slice(0, level).map((n) => n.id);
        const newPath = raw === '' ? kept : [...kept, Number(raw)];
        onChange([...otherBranchIds, ...newPath]);
    };

    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary">
                กำลังโหลดหมวดหมู่...
            </Typography>
        );
    }

    return (
        <Stack spacing={2}>
            <TextField select label="หมวดหมู่สินค้า" size="small" fullWidth value={root?.id ?? ''} onChange={selectLevel(0)} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
                <MenuItem value="">
                    <em>--กรุณาเลือก--</em>
                </MenuItem>
                {tree.map((node) => (
                    <MenuItem key={node.id} value={node.id}>
                        {node.name}
                    </MenuItem>
                ))}
            </TextField>

            <TextField
                select
                label="หมวดย่อยสินค้า"
                size="small"
                fullWidth
                disabled={!root}
                value={sub?.id ?? ''}
                onChange={selectLevel(1)}
                SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
            >
                <MenuItem value="">
                    <em>--กรุณาเลือก--</em>
                </MenuItem>
                {subOptions.map((node) => (
                    <MenuItem key={node.id} value={node.id}>
                        {node.name}
                    </MenuItem>
                ))}
            </TextField>

            <TextField
                select
                label="กลุ่มสินค้า"
                size="small"
                fullWidth
                disabled={!sub}
                value={currentPath[2]?.id ?? ''}
                onChange={selectLevel(2)}
                SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
            >
                <MenuItem value="">
                    <em>--กรุณาเลือก--</em>
                </MenuItem>
                {groupOptions.map((node) => (
                    <MenuItem key={node.id} value={node.id}>
                        {node.name}
                    </MenuItem>
                ))}
            </TextField>

            {currentPath.length > 0 && (
                <Stack spacing={0.5} sx={{ pt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        การผูก Marketplace ของหมวดหมู่ที่เลือก
                    </Typography>
                    {currentPath.map((node, i) => (
                        <Stack key={node.id} direction="row" spacing={1} alignItems="center">
                            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 96, flexShrink: 0 }}>
                                {LEVEL_LABELS[i]}:
                            </Typography>
                            <MappedPlatformsRow node={node} />
                        </Stack>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
