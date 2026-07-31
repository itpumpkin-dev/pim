import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Collapse, IconButton, Radio, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

interface CategoryNode {
    id: number;
    code: string;
    name: string;
    children: CategoryNode[];
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
 * Single-select category tree, for picking a parent category (Create/Edit
 * Category forms) — same tree data source and expand/collapse shape as
 * category-tree-picker.tsx (product multi-select), but one radio-style
 * selection instead of checkboxes, plus a pinned "root" option.
 */
export function CategoryParentTreePicker({
    value,
    onChange,
    excludeId,
    rootLabel,
}: {
    value: number | '';
    onChange: (id: number | '') => void;
    excludeId?: number;
    rootLabel: string;
}) {
    const [tree, setTree] = useState<CategoryNode[]>([]);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const url = excludeId ? `/catalog/categories/tree?exclude=${excludeId}` : '/catalog/categories/tree';

        fetch(url, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: CategoryNode[]) => {
                setTree(data);
                if (typeof value === 'number') {
                    const ancestors = findAncestorIds(data, value);
                    if (ancestors) setExpanded(new Set(ancestors));
                }
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [excludeId]);

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

    const renderNode = (node: CategoryNode, depth: number) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expanded.has(node.id);
        const isSelected = value === node.id;

        return (
            <Box key={node.id}>
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.5}
                    sx={{ pl: depth * 2.5, bgcolor: isSelected ? 'action.selected' : 'transparent', borderRadius: 1 }}
                >
                    {hasChildren ? (
                        <IconButton size="small" onClick={() => toggleExpand(node.id)}>
                            {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                        </IconButton>
                    ) : (
                        <Box sx={{ width: 32, flexShrink: 0 }} />
                    )}
                    <Radio size="small" checked={isSelected} onChange={() => onChange(node.id)} sx={{ p: 0.5 }} />
                    <Typography variant="body2" sx={{ cursor: 'pointer' }} onClick={() => onChange(node.id)}>
                        {node.name}
                    </Typography>
                </Stack>
                {hasChildren && (
                    <Collapse in={isExpanded}>{node.children.map((child) => renderNode(child, depth + 1))}</Collapse>
                )}
            </Box>
        );
    };

    if (loading) {
        return (
            <Typography variant="body2" color="text.secondary">
                กำลังโหลดหมวดหมู่...
            </Typography>
        );
    }

    return (
        <Box sx={{ maxHeight: 320, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
            <Stack
                direction="row"
                alignItems="center"
                spacing={0.5}
                sx={{ bgcolor: value === '' ? 'action.selected' : 'transparent', borderRadius: 1, mb: 0.5 }}
            >
                <Box sx={{ width: 32, flexShrink: 0 }} />
                <Radio size="small" checked={value === ''} onChange={() => onChange('')} sx={{ p: 0.5 }} />
                <Typography variant="body2" sx={{ fontStyle: 'italic', cursor: 'pointer' }} onClick={() => onChange('')}>
                    {rootLabel}
                </Typography>
            </Stack>
            {tree.map((node) => renderNode(node, 0))}
        </Box>
    );
}
