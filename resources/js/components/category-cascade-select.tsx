import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import { Bar, Button, Dialog, Icon, Input, Tag, Title } from '@ui5/webcomponents-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './category-cascade-select.module.css';

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
        <div className={styles.summary}>
            <span className={styles.summaryLabel}>{t('marketplaceMappingLabel')}</span>
            {names.length > 0 ? (
                <>
                    <Tag design="Information" hideStateIcon>
                        {t('mappedToPlatformsCount', { count: names.length })}
                    </Tag>
                    <span>({names.join(', ')})</span>
                </>
            ) : (
                <span className={`${styles.empty} ${styles.small}`}>{t('notMappedToAnyMarketplace')}</span>
            )}
        </div>
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
        return <span className={styles.muted}>{t('loadingCategories')}</span>;
    }

    if (currentPath.length === 0) {
        return <span className={styles.empty}>{t('categoryNotAssigned')}</span>;
    }

    return (
        <div className={styles.readOnlyStack}>
            <span style={{ color: 'var(--sapTextColor)', fontSize: 'var(--sapFontSize)' }}>{currentPath.map((n) => n.name).join(' > ')}</span>
            <MarketplaceMappingSummary node={currentPath[currentPath.length - 1]} />
        </div>
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
        <div className={styles.column}>
            {nodes.map((node) => {
                const isSelected = node.id === selectedId;
                return (
                    <button
                        type="button"
                        key={node.id}
                        onClick={() => onSelect(node)}
                        aria-pressed={isSelected}
                        className={isSelected ? `${styles.option} ${styles.optionSelected}` : styles.option}
                    >
                        <span>{node.name}</span>
                        {node.children.length > 0 && <Icon name="slim-arrow-right" className={styles.optionChevron} />}
                    </button>
                );
            })}
        </div>
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
        return <span className={styles.muted}>{t('loadingCategories')}</span>;
    }

    return (
        <div className={styles.stack}>
            <button type="button" className={styles.trigger} disabled={disabled} onClick={disabled ? undefined : openPicker}>
                <span className={currentPath.length > 0 ? undefined : styles.triggerEmpty}>
                    {currentPath.length > 0 ? currentPath.map((n) => n.name).join(' > ') : t('noCategorySelectedClickToSelect')}
                </span>
                <Icon name="slim-arrow-right" className={styles.chevron} />
            </button>

            {currentPath.length > 0 && <MarketplaceMappingSummary node={currentPath[currentPath.length - 1]} />}

            <Dialog
                open={open}
                className={styles.dialog}
                onClose={() => setOpen(false)}
                header={
                    <div className={styles.dialogHeader}>
                        <Title level="H5" size="H5" wrappingType="Normal">
                            {t('editProductCategoryDialogTitle')}
                        </Title>
                        <Button
                            design="Transparent"
                            icon="decline"
                            tooltip={t('cancel')}
                            accessibleName={t('cancel')}
                            onClick={() => setOpen(false)}
                        />
                    </div>
                }
                footer={
                    <Bar
                        design="Footer"
                        startContent={
                            <span className={styles.footerNote}>
                                {t('currentlySelected')} {pendingPath.length > 0 ? pendingPath.map((n) => n.name).join(' > ') : '—'}
                            </span>
                        }
                        endContent={
                            <>
                                <Button design="Emphasized" onClick={handleConfirm} disabled={pendingPath.length === 0}>
                                    {t('confirm')}
                                </Button>
                                <Button design="Transparent" onClick={() => setOpen(false)}>
                                    {t('cancel')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                <div className={styles.dialogBody}>
                    <div className={styles.searchBox}>
                        <Input
                            style={{ width: '100%' }}
                            placeholder={t('categorySearchPlaceholder')}
                            value={search}
                            showClearIcon
                            icon={<Icon name="search" />}
                            onInput={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {search.trim() !== '' ? (
                        <div className={styles.searchResults}>
                            {searchResults.length === 0 ? (
                                <div className={styles.muted} style={{ padding: '1rem' }}>
                                    {t('noCategoryMatching', { query: search })}
                                </div>
                            ) : (
                                searchResults.map(({ node, path }) => (
                                    <button
                                        type="button"
                                        key={node.id}
                                        className={`${styles.option} ${styles.resultItem}`}
                                        onClick={() => selectFromSearch(path)}
                                    >
                                        <span>{node.name}</span>
                                        <span className={`${styles.muted} ${styles.small}`}>{path.map((n) => n.name).join(' > ')}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className={styles.columns}>
                            <CategoryColumn nodes={tree} selectedId={pendingPath[0]?.id} onSelect={(node) => selectAt(0, node)} />
                            {pendingPath[0] && (
                                <CategoryColumn
                                    nodes={pendingPath[0].children}
                                    selectedId={pendingPath[1]?.id}
                                    onSelect={(node) => selectAt(1, node)}
                                />
                            )}
                            {pendingPath[1] && (
                                <CategoryColumn
                                    nodes={pendingPath[1].children}
                                    selectedId={pendingPath[2]?.id}
                                    onSelect={(node) => selectAt(2, node)}
                                />
                            )}
                        </div>
                    )}
                </div>
            </Dialog>
        </div>
    );
}
