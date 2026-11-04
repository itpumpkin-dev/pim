import { Text, Tree, TreeItem } from '@ui5/webcomponents-react';
import { useEffect, useState, type ReactNode } from 'react';

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

/** data-id of the pinned "root" option (no parent) */
const ROOT_ID = '';

/**
 * Single-select category tree, for picking a parent category (Create/Edit
 * Category forms) — same tree data source and expand/collapse shape as
 * category-tree-picker.tsx (product multi-select), but one single selection
 * (UI5 `Tree` with `selectionMode="Single"`) instead of checkboxes, plus a
 * pinned "root" option.
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

    const setNodeExpanded = (id: number, open: boolean) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (open) {
                next.add(id);
            } else {
                next.delete(id);
            }
            return next;
        });
    };

    const renderNode = (node: CategoryNode): ReactNode => (
        <TreeItem
            key={node.id}
            data-id={String(node.id)}
            text={node.name}
            selected={value === node.id}
            expanded={expanded.has(node.id)}
            hasChildren={node.children.length > 0}
        >
            {node.children.map(renderNode)}
        </TreeItem>
    );

    if (loading) {
        return <Text style={{ color: 'var(--sapContent_LabelColor)' }}>กำลังโหลดหมวดหมู่...</Text>;
    }

    return (
        <div
            style={{
                maxHeight: 320,
                overflowY: 'auto',
                border: '1px solid var(--sapGroup_ContentBorderColor)',
                borderRadius: 'var(--sapElement_BorderCornerRadius)',
            }}
        >
            <Tree
                selectionMode="Single"
                onItemToggle={(e) => {
                    const id = Number((e.detail.item as HTMLElement).dataset.id);
                    // the event fires before the item flips its own `expanded`
                    if (!Number.isNaN(id)) setNodeExpanded(id, !e.detail.item.expanded);
                }}
                onSelectionChange={(e) => {
                    const raw = (e.detail.targetItem as HTMLElement).dataset.id ?? ROOT_ID;
                    onChange(raw === ROOT_ID ? '' : Number(raw));
                }}
            >
                <TreeItem data-id={ROOT_ID} text={rootLabel} selected={value === ''} style={{ fontStyle: 'italic' }} />
                {tree.map(renderNode)}
            </Tree>
        </div>
    );
}
