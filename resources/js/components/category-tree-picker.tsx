import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { Box, Button, Chip, Checkbox, Collapse, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

interface CategoryNode {
    id: number;
    code: string;
    name: string;
    children: CategoryNode[];
}

interface SelectedCategory {
    id: number;
    name: string;
}

function findAncestorIds(nodes: CategoryNode[], targetId: number, path: number[] = []): number[] | null {
    for (const node of nodes) {
        if (node.id === targetId) return path;
        const found = findAncestorIds(node.children, targetId, [...path, node.id]);
        if (found) return found;
    }
    return null;
}

/**
 * A node stays visible while searching if it (or any descendant) matches —
 * that's what keeps the ancestor chain down to a match visible even though
 * the ancestor's own name doesn't match.
 */
function collectVisible(nodes: CategoryNode[], query: string): Set<number> {
    const visibleIds = new Set<number>();

    const walk = (node: CategoryNode): boolean => {
        const selfMatch = node.name.toLowerCase().includes(query);
        const hasVisibleChild = node.children.map(walk).some(Boolean);

        if (selfMatch || hasVisibleChild) {
            visibleIds.add(node.id);
            return true;
        }
        return false;
    };

    nodes.forEach(walk);
    return visibleIds;
}

function highlightMatch(name: string, query: string) {
    if (!query) return name;

    const index = name.toLowerCase().indexOf(query);
    if (index === -1) return name;

    return (
        <>
            {name.slice(0, index)}
            <Box component="mark" sx={{ bgcolor: '#fef08a', color: 'inherit', borderRadius: 0.5, px: 0.25 }}>
                {name.slice(index, index + query.length)}
            </Box>
            {name.slice(index + query.length)}
        </>
    );
}

/**
 * Multi-select category tree: tick any node at any depth. The full tree
 * (catalog.categories.tree, ~1,086 rows) is only fetched once the user
 * actually opens the picker — before that, already-assigned categories are
 * shown as plain chips from `initialSelected` (passed down from the Edit
 * Product page's own load, a handful of rows) so the page never has to wait
 * on the tree just to render what's already selected.
 */
export function CategoryTreePicker({
    value,
    onChange,
    initialSelected = [],
}: {
    value: number[];
    onChange: (ids: number[]) => void;
    initialSelected?: SelectedCategory[];
}) {
    const [open, setOpen] = useState(false);
    const [tree, setTree] = useState<CategoryNode[]>([]);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const namesById = useMemo(() => new Map(initialSelected.map((c) => [c.id, c.name])), [initialSelected]);

    useEffect(() => {
        if (!open || tree.length > 0) return;

        setLoading(true);
        fetch('/catalog/categories/tree', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: CategoryNode[]) => {
                setTree(data);
                setExpanded((prev) => {
                    const next = new Set(prev);
                    value.forEach((id) => {
                        findAncestorIds(data, id)?.forEach((ancestorId) => next.add(ancestorId));
                    });
                    return next;
                });
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const query = search.trim().toLowerCase();
    const visibleIds = useMemo(() => (query ? collectVisible(tree, query) : null), [tree, query]);

    const toggleExpand = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Checking a node also checks every ancestor up to the root, so the user
    // never has to tick the parent chain by hand. Unchecking only removes the
    // clicked node itself — cascading the uncheck upward would be wrong
    // whenever a sibling under the same parent is still checked.
    const toggleCheck = (id: number) => {
        if (value.includes(id)) {
            onChange(value.filter((v) => v !== id));
            return;
        }

        const ancestorIds = findAncestorIds(tree, id) ?? [];
        const toAdd = [id, ...ancestorIds].filter((nid) => !value.includes(nid));
        onChange([...value, ...toAdd]);
    };

    const renderNode = (node: CategoryNode, depth: number) => {
        const children = visibleIds ? node.children.filter((c) => visibleIds.has(c.id)) : node.children;
        const hasChildren = children.length > 0;
        // While searching, every visible branch is auto-expanded so matches
        // deep in the tree are never hidden behind a collapsed ancestor.
        const isExpanded = visibleIds ? true : expanded.has(node.id);
        const isChecked = value.includes(node.id);

        return (
            <Box key={node.id}>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ pl: depth * 2.5 }}>
                    {hasChildren ? (
                        <IconButton size="small" onClick={() => toggleExpand(node.id)} disabled={Boolean(visibleIds)}>
                            {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                        </IconButton>
                    ) : (
                        <Box sx={{ width: 32, flexShrink: 0 }} />
                    )}
                    <Checkbox size="small" checked={isChecked} onChange={() => toggleCheck(node.id)} sx={{ p: 0.5 }} />
                    <Typography variant="body2" sx={{ cursor: 'pointer' }} onClick={() => toggleCheck(node.id)}>
                        {highlightMatch(node.name, query)}
                    </Typography>
                </Stack>
                {hasChildren && <Collapse in={isExpanded}>{children.map((child) => renderNode(child, depth + 1))}</Collapse>}
            </Box>
        );
    };

    const removeSelected = (id: number) => onChange(value.filter((v) => v !== id));

    if (!open) {
        return (
            <Stack spacing={1.5}>
                {value.length > 0 ? (
                    <Stack direction="row" flexWrap="wrap" sx={{ gap: 1 }}>
                        {value.map((id) => (
                            <Chip key={id} label={namesById.get(id) ?? `#${id}`} size="small" onDelete={() => removeSelected(id)} />
                        ))}
                    </Stack>
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        ยังไม่ได้กำหนดหมวดหมู่
                    </Typography>
                )}
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditOutlinedIcon fontSize="small" />}
                    onClick={() => setOpen(true)}
                    sx={{ alignSelf: 'flex-start' }}
                >
                    {value.length > 0 ? 'แก้ไขหมวดหมู่' : 'เลือกหมวดหมู่'}
                </Button>
            </Stack>
        );
    }

    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary">
                กำลังโหลดหมวดหมู่...
            </Typography>
        );
    }

    const visibleRoots = visibleIds ? tree.filter((node) => visibleIds.has(node.id)) : tree;

    return (
        <Box>
            <TextField
                size="small"
                fullWidth
                placeholder="ค้นหาหมวดหมู่..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ mb: 1 }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        </InputAdornment>
                    ),
                }}
            />
            <Box sx={{ maxHeight: 320, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
                {visibleRoots.map((node) => renderNode(node, 0))}
                {query && visibleRoots.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                        ไม่พบหมวดหมู่ที่ตรงกับ &quot;{search}&quot;
                    </Typography>
                )}
            </Box>
        </Box>
    );
}
