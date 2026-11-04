import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import { Bar, BusyIndicator, Button, Dialog, Icon, Input, Label, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './marketplace-category-picker.module.css';

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

    const clearValue = (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onChange(null);
    };

    const spinner = (size: 'S' | 'M') => <BusyIndicator active delay={0} size={size} />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <Label showColon={false} style={{ fontWeight: 600 }}>
                {label}
            </Label>
            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled || undefined}
                onClick={disabled ? undefined : openPicker}
                onKeyDown={
                    disabled
                        ? undefined
                        : (e) => {
                              if (e.target !== e.currentTarget) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  void openPicker();
                              }
                          }
                }
                className={[styles.trigger, disabled ? styles.triggerDisabled : ''].filter(Boolean).join(' ')}
            >
                <span
                    style={{
                        fontSize: 'var(--sapFontSize)',
                        color:
                            loadingCurrent || currentPath.length === 0
                                ? 'var(--sapContent_DisabledTextColor, var(--sapContent_LabelColor))'
                                : 'var(--sapTextColor)',
                        fontStyle: !loadingCurrent && currentPath.length === 0 ? 'italic' : 'normal',
                    }}
                >
                    {loadingCurrent
                        ? t('loadingEllipsis')
                        : currentPath.length > 0
                          ? currentPath.map((n) => n.name).join(' > ')
                          : t('notSetClickToSelectPlatformCategory', { platform: label })}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {!disabled && currentPath.length > 0 && (
                        <Button design="Transparent" icon="decline" tooltip={t('clearValue')} accessibleName={t('clearValue')} onClick={clearValue} />
                    )}
                    <Icon name="slim-arrow-right" style={{ color: 'var(--sapContent_IconColor)', width: '1rem', height: '1rem' }} />
                </div>
            </div>

            <Dialog
                open={open}
                onClose={() => setOpen(false)}
                className={styles.dialog}
                style={{ width: 'min(900px, calc(100vw - 2rem))' }}
                header={
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            gap: '0.5rem',
                            padding: '0.25rem 0',
                        }}
                    >
                        <Title level="H5" size="H5" wrappingType="Normal">
                            {t('selectPlatformCategoryDialogTitle', { platform: label })}
                        </Title>
                        <Button design="Transparent" icon="decline" accessibleName={t('cancel')} onClick={() => setOpen(false)} />
                    </div>
                }
                footer={
                    <Bar
                        design="Footer"
                        startContent={
                            <Text
                                style={{
                                    fontSize: 'var(--sapFontSmallSize)',
                                    color: canConfirm ? 'var(--sapContent_LabelColor)' : 'var(--sapNegativeTextColor, var(--sapNegativeColor))',
                                }}
                            >
                                {selectedPath.length > 0
                                    ? selectedPath.map((n) => n.name).join(' > ') + (canConfirm ? '' : ` — ${t('selectDownToMostSpecificCategory')}`)
                                    : '—'}
                            </Text>
                        }
                        endContent={
                            <>
                                <Button onClick={() => setOpen(false)}>{t('cancel')}</Button>
                                <Button design="Emphasized" onClick={handleConfirm} disabled={!canConfirm}>
                                    {t('confirm')}
                                </Button>
                            </>
                        }
                    />
                }
            >
                <div>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--sapGroup_ContentBorderColor)' }}>
                        <Input
                            style={{ width: '100%' }}
                            placeholder={t('categorySearchPlaceholder')}
                            value={search}
                            onInput={(e) => setSearch(e.target.value ?? '')}
                            icon={<Icon name="search" />}
                        />
                    </div>

                    {search.trim() !== '' ? (
                        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                            {searching ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>{spinner('M')}</div>
                            ) : searchResults.length === 0 ? (
                                <Text style={{ display: 'block', padding: '1rem', color: 'var(--sapContent_LabelColor)' }}>
                                    {t('noCategoryMatching', { query: search })}
                                </Text>
                            ) : (
                                searchResults.map((result) => (
                                    <div key={result.id} className={styles.searchResult} onClick={() => selectFromSearch(result)}>
                                        <div style={{ fontSize: 'var(--sapFontSize)', color: 'var(--sapTextColor)' }}>{result.name}</div>
                                        {result.parent_name && (
                                            <div style={{ fontSize: 'var(--sapFontSmallSize)', color: 'var(--sapContent_LabelColor)' }}>
                                                {result.parent_name}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    ) : loadingLevel === 0 && columns.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360 }}>{spinner('M')}</div>
                    ) : (
                        <div style={{ display: 'flex', height: 360, overflowX: 'auto' }}>
                            {columns.map((nodes, level) => (
                                <div key={level} className={styles.column}>
                                    {nodes.map((node) => {
                                        const isSelected = node.id === selectedPath[level]?.id;
                                        return (
                                            <div
                                                key={node.id}
                                                onClick={() => selectAt(level, node)}
                                                className={[styles.node, isSelected ? styles.nodeSelected : ''].filter(Boolean).join(' ')}
                                            >
                                                <span>{node.name}</span>
                                                {!node.is_leaf && (
                                                    <Icon
                                                        name="slim-arrow-right"
                                                        style={{
                                                            width: '1rem',
                                                            height: '1rem',
                                                            flexShrink: 0,
                                                            color: isSelected ? 'var(--sapBrandColor)' : 'var(--sapContent_IconColor)',
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                            {loadingLevel !== null && loadingLevel > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 220, flexShrink: 0 }}>
                                    {spinner('S')}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Dialog>
        </div>
    );
}
