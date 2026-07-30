import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Checkbox, Collapse, IconButton, Stack, Typography } from '@mui/material';
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
 * Multi-select category tree: tick any node at any depth. Fetches the whole
 * tree once (catalog.categories.tree, ~1,086 rows) and renders it collapsed
 * except for the ancestors of whatever's already selected.
 */
export function CategoryTreePicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
    const [tree, setTree] = useState<CategoryNode[]>([]);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
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
    }, []);

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

    const toggleCheck = (id: number) => {
        onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    };

    const renderNode = (node: CategoryNode, depth: number) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = expanded.has(node.id);
        const isChecked = value.includes(node.id);

        return (
            <Box key={node.id}>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ pl: depth * 2.5 }}>
                    {hasChildren ? (
                        <IconButton size="small" onClick={() => toggleExpand(node.id)}>
                            {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                        </IconButton>
                    ) : (
                        <Box sx={{ width: 32, flexShrink: 0 }} />
                    )}
                    <Checkbox size="small" checked={isChecked} onChange={() => toggleCheck(node.id)} sx={{ p: 0.5 }} />
                    <Typography variant="body2" sx={{ cursor: 'pointer' }} onClick={() => toggleCheck(node.id)}>
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
            {tree.map((node) => renderNode(node, 0))}
        </Box>
    );
}
