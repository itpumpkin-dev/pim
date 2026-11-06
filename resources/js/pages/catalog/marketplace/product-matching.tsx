import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/action.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import { Avatar, Button, Link, Option, OptionGroup, Select, Switch, Tab, TabContainer, Tag } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';

import { Body, Caption, HStack, PageHeader, Pager, SearchField, TONE_TEXT } from './marketplace-ui';
import styles from './marketplace.module.css';
import pm from './product-matching.module.css';

type Platform = 'lazada' | 'shopee' | 'tiktok' | 'woocommerce';
type MatchTab = 'matched' | 'unmatched' | 'not_listed';

interface ShopRow {
    id: number;
    name: string;
    platform: Platform;
    listing_count: number;
    matched_count: number;
    active_count: number;
    last_synced_at: string | null;
}

interface ShopGroup {
    platform: Platform;
    label: string;
    shops: ShopRow[];
}

interface ListingRow {
    id: number;
    item_id: string;
    variant_id: string;
    seller_sku: string | null;
    name: string | null;
    status: string | null;
    is_active: boolean;
    price: string | null;
    quantity: number | null;
    image_url: string | null;
    url: string | null;
    match_method: 'auto_sku' | 'manual' | 'pushed' | null;
    matched_at: string | null;
    product: { id: number; sku: string; name: string | null } | null;
    sku_drift: boolean;
}

interface NotListedRow {
    id: number;
    sku: string;
    name: string | null;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Filters {
    shop_id: number | null;
    tab: MatchTab;
    search: string;
    active_only: boolean;
    per_page: number;
}

interface Props {
    shopGroups: ShopGroup[];
    filters: Filters;
    summary: Record<MatchTab, number>;
    rows: Paginated<ListingRow | NotListedRow> | null;
}

const PAGE_URL = '/catalog/marketplace/product-matching';
const TABS: MatchTab[] = ['matched', 'unmatched', 'not_listed'];
const TAB_LABEL: Record<MatchTab, string> = {
    matched: 'จับคู่แล้ว',
    unmatched: 'ยังไม่จับคู่',
    not_listed: 'ยังไม่ได้ลงขาย',
};
const MATCH_METHOD_LABEL: Record<NonNullable<ListingRow['match_method']>, string> = {
    auto_sku: 'Auto (SKU)',
    manual: 'Manual',
    pushed: 'Pushed',
};

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const formatNumber = (value: number) => value.toLocaleString('th-TH');

/**
 * "จับคู่สินค้า (Product Matching)" — phase 1 (read-only): per shop, which
 * marketplace listings are matched to a PIM product (auto by exact SKU, or
 * manual/pushed later), which aren't, and which PIM products aren't listed on
 * that shop at all. Data comes from marketplace_listings — see
 * ProductMatchingController / MarketplaceListingSyncService.
 */
export default function ProductMatching({ shopGroups, filters, summary, rows }: Props) {
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canSync = permissions.includes('products.edit_products');
    const canEditProducts = permissions.includes('products.edit_products');

    const [search, setSearch] = useState(filters.search ?? '');
    const [syncing, setSyncing] = useState(false);
    const firstRender = useRef(true);

    const allShops = shopGroups.flatMap((group) => group.shops);
    const shop = allShops.find((s) => s.id === filters.shop_id) ?? null;
    const platformLabel = shopGroups.find((g) => g.platform === shop?.platform)?.label ?? '';

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Catalog', href: '#' },
        { title: 'Master', href: '#' },
        { title: 'Marketplace', href: '#' },
        { title: 'จับคู่สินค้า', href: PAGE_URL },
    ];

    const visit = (overrides: Partial<Filters> & { page?: number }, options: { replace?: boolean } = {}) => {
        const next = { ...filters, search, ...overrides };
        router.get(
            PAGE_URL,
            {
                shop_id: next.shop_id ?? undefined,
                tab: next.tab,
                search: next.search || undefined,
                active_only: next.active_only ? 1 : 0,
                per_page: next.per_page,
                page: overrides.page,
            },
            { preserveState: true, preserveScroll: true, replace: options.replace },
        );
    };

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => visit({ search }, { replace: true }), 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const syncShop = () => {
        if (!shop) return;
        setSyncing(true);
        router.post(PAGE_URL + '/sync', { shop_id: shop.id }, { preserveScroll: true, onFinish: () => setSyncing(false) });
    };

    const matchedPct = shop && shop.listing_count > 0 ? Math.round((shop.matched_count / shop.listing_count) * 1000) / 10 : 0;

    const kpis: { label: string; value: string; small?: boolean; tone?: keyof typeof TONE_TEXT }[] = [
        { label: 'Listing ทั้งหมด', value: formatNumber(shop?.listing_count ?? 0) },
        { label: 'จับคู่แล้ว', value: `${matchedPct}%`, tone: matchedPct >= 90 ? 'success' : matchedPct > 0 ? 'warning' : undefined },
        { label: 'ยังไม่จับคู่', value: formatNumber(shop ? shop.listing_count - shop.matched_count : 0), tone: 'warning' },
        { label: 'ยังไม่ได้ลงขาย (PIM)', value: formatNumber(summary.not_listed) },
        { label: 'ซิงค์ล่าสุด', value: formatDateTime(shop?.last_synced_at ?? null), small: true },
    ];

    const listingCell = (row: ListingRow) => (
        <HStack gap="0.75rem" align="flex-start">
            <Avatar shape="Square" size="XS" style={{ width: 40, height: 40, flexShrink: 0, background: 'var(--sapList_HeaderBackground)' }}>
                {row.image_url ? <img src={row.image_url} alt="" /> : undefined}
            </Avatar>
            <div className={pm.cellStack}>
                <Body style={{ fontWeight: 600 }}>
                    <span className={pm.clamp}>{row.name || row.seller_sku || '—'}</span>
                </Body>
                <Caption mono>{row.seller_sku ?? '(ไม่มี SKU)'}</Caption>
                <Caption mono>
                    Item {row.item_id}
                    {row.variant_id ? ` · Var ${row.variant_id}` : ''}
                </Caption>
            </div>
        </HStack>
    );

    const productLink = (product: { id: number; sku: string; name: string | null }) => (
        <div className={pm.cellStack}>
            {canEditProducts ? (
                <Link
                    href={`/catalog/products/${product.id}/edit`}
                    className={pm.link}
                    onClick={(e) => {
                        e.preventDefault();
                        router.visit(`/catalog/products/${product.id}/edit`);
                    }}
                >
                    {product.sku}
                </Link>
            ) : (
                <Body style={{ fontWeight: 600 }}>{product.sku}</Body>
            )}
            {product.name && product.name !== product.sku && <Caption>{product.name}</Caption>}
        </div>
    );

    const statusCell = (row: ListingRow) => (
        <Body style={{ color: row.is_active ? TONE_TEXT.success : TONE_TEXT.neutral, fontWeight: 600 }}>{row.status ?? '—'}</Body>
    );

    const openCell = (row: ListingRow) =>
        row.url ? (
            <Button
                design="Transparent"
                icon="action"
                tooltip={`เปิดบน ${platformLabel}`}
                accessibleName={`Open on ${platformLabel}`}
                onClick={() => window.open(row.url ?? undefined, '_blank', 'noopener,noreferrer')}
            />
        ) : null;

    const commonListingColumns: FioriResponsiveColumn<ListingRow>[] = [
        { key: 'status', header: 'สถานะ', priority: 'medium', minWidth: 120, render: statusCell },
        { key: 'price', header: 'ราคา', priority: 'low', align: 'right', minWidth: 90, render: (row) => <Body>{row.price ?? '—'}</Body> },
        { key: 'quantity', header: 'คงเหลือ', priority: 'low', align: 'right', minWidth: 80, render: (row) => <Body>{row.quantity ?? '—'}</Body> },
        { key: 'open', header: '', popinText: platformLabel, priority: 'always', align: 'right', minWidth: 48, render: openCell },
    ];

    const matchedColumns: FioriResponsiveColumn<ListingRow>[] = [
        { key: 'listing', header: `Listing บน ${platformLabel}`, priority: 'always', minWidth: 260, render: listingCell },
        {
            key: 'product',
            header: 'สินค้าใน PIM',
            priority: 'high',
            minWidth: 200,
            render: (row) => (row.product ? productLink(row.product) : <Body>—</Body>),
        },
        {
            key: 'match',
            header: 'วิธีจับคู่',
            priority: 'high',
            minWidth: 140,
            render: (row) => (
                <HStack gap="0.25rem" wrap>
                    {row.match_method && (
                        <Tag design={row.match_method === 'auto_sku' ? 'Information' : 'Positive'} hideStateIcon>
                            {MATCH_METHOD_LABEL[row.match_method]}
                        </Tag>
                    )}
                    {row.sku_drift && (
                        <Tag design="Critical" title="SKU บนแพลตฟอร์มไม่ตรงกับ SKU ใน PIM">
                            SKU ไม่ตรง
                        </Tag>
                    )}
                </HStack>
            ),
        },
        ...commonListingColumns,
    ];

    const unmatchedColumns: FioriResponsiveColumn<ListingRow>[] = [
        { key: 'listing', header: `Listing บน ${platformLabel}`, priority: 'always', minWidth: 300, render: listingCell },
        ...commonListingColumns,
    ];

    const notListedColumns: FioriResponsiveColumn<NotListedRow>[] = [
        {
            key: 'sku',
            header: 'SKU (PIM)',
            priority: 'always',
            minWidth: 160,
            render: (row) => productLink({ id: row.id, sku: row.sku, name: null }),
        },
        { key: 'name', header: 'ชื่อสินค้า', priority: 'high', minWidth: 260, render: (row) => <Body>{row.name ?? '—'}</Body> },
    ];

    const currentPage = rows?.current_page ?? 1;
    const lastPage = rows?.last_page ?? 1;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="จับคู่สินค้า (Product Matching)" />
            <div className={styles.page}>
                <PageHeader
                    title="จับคู่สินค้า (Product Matching)"
                    subtitle="Listing จริงบนแต่ละร้าน เทียบกับสินค้าใน PIM — จับคู่อัตโนมัติด้วย SKU ที่ตรงกันทุกตัวอักษร"
                />

                {allShops.length === 0 ? (
                    <FioriMessageStrip severity="information">ไม่มีร้านที่คุณมีสิทธิ์เข้าถึง</FioriMessageStrip>
                ) : (
                    <>
                        <div className={pm.shopBar}>
                            <Select
                                className={pm.shopSelect}
                                value={shop ? String(shop.id) : ''}
                                accessibleName="ร้าน"
                                onChange={(e) => {
                                    const v = Number(e.detail.selectedOption.value);
                                    if (v) visit({ shop_id: v, page: 1 });
                                }}
                            >
                                {shopGroups.map((group) => (
                                    <OptionGroup key={group.platform} headerText={group.label}>
                                        {group.shops.map((s) => (
                                            <Option
                                                key={s.id}
                                                value={String(s.id)}
                                                additionalText={s.listing_count ? formatNumber(s.listing_count) : 'ยังไม่ซิงค์'}
                                            >
                                                {s.name}
                                            </Option>
                                        ))}
                                    </OptionGroup>
                                ))}
                            </Select>
                            {canSync && shop && (
                                <Button
                                    design="Emphasized"
                                    icon="synchronize"
                                    disabled={syncing}
                                    loading={syncing}
                                    loadingDelay={0}
                                    onClick={syncShop}
                                >
                                    ซิงค์ร้านนี้
                                </Button>
                            )}
                        </div>

                        <div className={pm.kpiGrid}>
                            {kpis.map((kpi) => (
                                <div key={kpi.label} className={pm.kpi}>
                                    <span className={pm.kpiLabel}>{kpi.label}</span>
                                    <span
                                        className={kpi.small ? pm.kpiValueSmall : pm.kpiValue}
                                        style={kpi.tone ? { color: TONE_TEXT[kpi.tone] } : undefined}
                                        title={kpi.value}
                                    >
                                        {kpi.value}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {shop && shop.listing_count === 0 && (
                            <FioriMessageStrip severity="information" style={{ marginBottom: '1rem' }}>
                                {canSync
                                    ? 'ร้านนี้ยังไม่มีข้อมูล listing — กด "ซิงค์ร้านนี้" เพื่อดึงข้อมูลจากแพลตฟอร์ม (อ่านอย่างเดียว ไม่แก้ไขอะไรบนร้าน)'
                                    : 'ร้านนี้ยังไม่มีข้อมูล listing — ให้ผู้มีสิทธิ์ซิงค์ดึงข้อมูลจากแพลตฟอร์มก่อน'}
                            </FioriMessageStrip>
                        )}

                        <div className={styles.card}>
                            <TabContainer
                                collapsed
                                className={pm.tabs}
                                onTabSelect={(e) => {
                                    const tab = TABS[e.detail.tabIndex];
                                    if (tab && tab !== filters.tab) visit({ tab, page: 1 });
                                }}
                            >
                                {TABS.map((tab) => (
                                    <Tab key={tab} text={TAB_LABEL[tab]} additionalText={formatNumber(summary[tab])} selected={tab === filters.tab} />
                                ))}
                            </TabContainer>

                            <div className={styles.toolbar}>
                                <div className={pm.filterRow}>
                                    <SearchField
                                        value={search}
                                        onChange={setSearch}
                                        placeholder={filters.tab === 'not_listed' ? 'ค้นหา SKU หรือชื่อสินค้า...' : 'ค้นหา SKU, ชื่อ หรือ Item ID...'}
                                    />
                                    {filters.tab !== 'not_listed' && (
                                        <HStack gap="0.5rem">
                                            <Switch
                                                checked={filters.active_only}
                                                accessibleName="เฉพาะที่เปิดขาย"
                                                onChange={(e) => visit({ active_only: e.target.checked, page: 1 })}
                                            />
                                            <Body>เฉพาะที่เปิดขาย</Body>
                                        </HStack>
                                    )}
                                </div>

                                <Pager
                                    currentPage={currentPage}
                                    lastPage={lastPage}
                                    perPage={filters.per_page}
                                    perPageLabel="ต่อหน้า"
                                    onPerPageChange={(value) => visit({ per_page: [25, 50, 100].includes(value) ? value : 25, page: 1 })}
                                    onGoToPage={(page) => visit({ page })}
                                />
                            </div>

                            <div className={styles.divider} />

                            {rows &&
                                (filters.tab === 'not_listed' ? (
                                    <FioriResponsiveTable
                                        variant="plain"
                                        columns={notListedColumns}
                                        rows={rows.data as NotListedRow[]}
                                        getRowKey={(row: NotListedRow) => row.id}
                                        emptyMessage="ไม่พบสินค้าที่ตรงตามเงื่อนไข"
                                    />
                                ) : (
                                    <FioriResponsiveTable
                                        variant="plain"
                                        columns={filters.tab === 'matched' ? matchedColumns : unmatchedColumns}
                                        rows={rows.data as ListingRow[]}
                                        getRowKey={(row: ListingRow) => row.id}
                                        emptyMessage="ไม่พบ listing ที่ตรงตามเงื่อนไข"
                                    />
                                ))}

                            <div className={styles.footer} style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}>
                                <Caption>
                                    แสดง {rows?.data.length ?? 0} จาก {formatNumber(rows?.total ?? 0)} รายการ
                                </Caption>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
