import { FioriMessageStrip } from '@/components/fiori-form';
import { useFioriConfirm } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/accept.js';
import '@ui5/webcomponents-icons/dist/action.js';
import '@ui5/webcomponents-icons/dist/chain-link.js';
import '@ui5/webcomponents-icons/dist/disconnected.js';
import '@ui5/webcomponents-icons/dist/hide.js';
import '@ui5/webcomponents-icons/dist/show.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import {
    Avatar,
    Bar,
    Button,
    Dialog,
    Input,
    Label,
    Link,
    Option,
    OptionGroup,
    Select,
    Switch,
    Tab,
    TabContainer,
    Tag,
    Title,
} from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';

import { Body, Caption, HStack, PageHeader, Pager, SearchField, TONE_TEXT } from './marketplace-ui';
import styles from './marketplace.module.css';
import { ProductMatchingLinkDialog } from './product-matching-link-dialog';
import pm from './product-matching.module.css';

type Platform = 'lazada' | 'shopee' | 'tiktok' | 'woocommerce';
type MatchTab = 'matched' | 'unmatched' | 'suggested' | 'ignored' | 'not_listed';
type SuggestionType = 'normalized' | 'trimmed' | 'prefix' | 'pack' | 'bundle' | 'barcode';

interface ShopRow {
    id: number;
    name: string;
    platform: Platform;
    listing_count: number;
    matched_count: number;
    ignored_count: number;
    active_count: number;
    last_synced_at: string | null;
}

interface ShopGroup {
    platform: Platform;
    label: string;
    shops: ShopRow[];
}

interface ProductRef {
    id: number;
    sku: string;
    name: string | null;
}

interface SuggestionItem {
    product_id: number;
    sku: string;
    name: string | null;
    quantity: number;
}

interface Suggestion {
    type: SuggestionType;
    confidence: 'high' | 'medium' | 'low';
    items: SuggestionItem[];
    pack_quantity: number | null;
    reason: string;
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
    match_method: 'auto_sku' | 'manual' | 'suggested' | 'bundle' | 'pushed' | null;
    matched_at: string | null;
    pack_quantity: number | null;
    product: ProductRef | null;
    components: SuggestionItem[];
    sku_drift: boolean;
    suggestions: Suggestion[];
    ignored_at: string | null;
    ignored_by: string | null;
    ignore_reason: string | null;
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
const TABS: MatchTab[] = ['matched', 'unmatched', 'suggested', 'ignored', 'not_listed'];
const TAB_LABEL: Record<MatchTab, string> = {
    matched: 'ผูกแล้ว',
    unmatched: 'ยังไม่มีคู่',
    suggested: 'มีคำแนะนำ',
    ignored: 'ซ่อนไว้',
    not_listed: 'PIM ที่ยังไม่ลงขาย',
};
const MATCH_METHOD_LABEL: Record<NonNullable<ListingRow['match_method']>, string> = {
    auto_sku: 'Auto (SKU)',
    manual: 'Manual',
    suggested: 'ยืนยันคำแนะนำ',
    bundle: 'Manual',
    pushed: 'Pushed',
};
const CONFIDENCE_LABEL: Record<Suggestion['confidence'], string> = { high: 'มั่นใจสูง', medium: 'ปานกลาง', low: 'ต่ำ' };

const formatDateTime = (value: string | null) => (value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const formatNumber = (value: number) => value.toLocaleString('th-TH');

const suggestionTag = (s: Suggestion) => {
    if (s.type === 'bundle') return 'ชุดรวม';
    if (s.type === 'barcode') return 'บาร์โค้ด';
    if (s.type === 'pack' && s.pack_quantity && s.pack_quantity > 1) return `แพ็ก ×${s.pack_quantity}`;
    return 'SKU ใกล้เคียง';
};

/**
 * "จับคู่สินค้า (Product Matching)": per shop, which marketplace listings are
 * linked to PIM (auto by exact SKU, by hand, from a confirmed suggestion, as
 * a pack ×N or as a bundle), which aren't (with suggestions), which were
 * hidden, and which PIM products aren't listed on that shop. Data comes from
 * marketplace_listings — see ProductMatchingController /
 * ProductMatchingActionsController / ListingMatchSuggester. Every action here
 * only changes PIM's own link table, never the marketplace.
 */
export default function ProductMatching({ shopGroups, filters, summary, rows }: Props) {
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canSync = permissions.includes('products.edit_products');
    const canEditProducts = permissions.includes('products.edit_products');
    const canMatch = permissions.includes('products.edit_products');

    const [search, setSearch] = useState(filters.search ?? '');
    const [syncing, setSyncing] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [bulkBusy, setBulkBusy] = useState(false);
    const [linkTarget, setLinkTarget] = useState<ListingRow | null>(null);
    const [ignoreTarget, setIgnoreTarget] = useState<ListingRow | null>(null);
    const [ignoreReason, setIgnoreReason] = useState('');
    const firstRender = useRef(true);
    const { confirm, confirmElement } = useFioriConfirm();

    const allShops = shopGroups.flatMap((group) => group.shops);
    const shop = allShops.find((s) => s.id === filters.shop_id) ?? null;
    const platformLabel = shopGroups.find((g) => g.platform === shop?.platform)?.label ?? '';

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Catalog', href: '#' },
        { title: 'Master', href: '#' },
        { title: 'Marketplace', href: '#' },
        { title: 'จับคู่สินค้า', href: PAGE_URL },
    ];

    // selection only makes sense within one tab/page of one shop
    useEffect(() => {
        setSelected([]);
    }, [filters.shop_id, filters.tab, rows?.current_page]);

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

    const postAction = (row: ListingRow, action: string, data: Record<string, unknown> = {}, onSuccess?: () => void) => {
        setBusyId(row.id);
        router.post(`${PAGE_URL}/listings/${row.id}/${action}`, data as Record<string, string>, {
            preserveScroll: true,
            onSuccess: () => onSuccess?.(),
            onFinish: () => setBusyId(null),
        });
    };

    const accept = (row: ListingRow) => {
        const top = row.suggestions[0];
        if (top) postAction(row, 'accept', { index: 0, type: top.type });
    };

    const unlink = async (row: ListingRow) => {
        const ok = await confirm({
            title: 'ยกเลิกการผูก?',
            message: `ยกเลิกการผูก ${row.seller_sku ?? 'Item ' + row.item_id} กับสินค้าใน PIM\nการซิงค์ครั้งถัดไปอาจจับคู่อัตโนมัติอีกถ้า SKU ตรงกับ PIM — ถ้าไม่ต้องการให้จับคู่อีก ให้ "ซ่อน" หลังยกเลิก`,
            confirmLabel: 'ยกเลิกการผูก',
            destructive: true,
        });
        if (ok) postAction(row, 'unlink');
    };

    const submitIgnore = () => {
        if (!ignoreTarget) return;
        postAction(ignoreTarget, 'ignore', { reason: ignoreReason.trim() || null }, () => setIgnoreTarget(null));
    };

    const bulkAccept = () => {
        if (selected.length === 0) return;
        setBulkBusy(true);
        router.post(
            PAGE_URL + '/bulk-accept',
            { listing_ids: selected.map(Number) },
            { preserveScroll: true, onSuccess: () => setSelected([]), onFinish: () => setBulkBusy(false) },
        );
    };

    const matchedPct = shop && shop.listing_count > 0 ? Math.round((shop.matched_count / shop.listing_count) * 1000) / 10 : 0;

    const kpis: { label: string; value: string; small?: boolean; tone?: keyof typeof TONE_TEXT }[] = [
        { label: 'Listing ทั้งหมด', value: formatNumber(shop?.listing_count ?? 0) },
        { label: 'ผูกแล้ว', value: `${matchedPct}%`, tone: matchedPct >= 90 ? 'success' : matchedPct > 0 ? 'warning' : undefined },
        {
            label: 'ยังไม่มีคู่',
            value: formatNumber(shop ? shop.listing_count - shop.matched_count - shop.ignored_count : 0),
            tone: 'warning',
        },
        { label: 'PIM ที่ยังไม่ลงขาย', value: formatNumber(summary.not_listed) },
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

    const productLink = (product: ProductRef, suffix?: string) => (
        <div className={pm.cellStack}>
            <HStack gap="0.375rem">
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
                {suffix && <Body style={{ fontWeight: 600 }}>{suffix}</Body>}
            </HStack>
            {product.name && product.name !== product.sku && <Caption>{product.name}</Caption>}
        </div>
    );

    const linkedCell = (row: ListingRow) => {
        if (row.components.length > 0) {
            return (
                <div className={pm.cellStack}>
                    <Tag design="Set2" colorScheme="6" hideStateIcon>
                        ชุดรวม {row.components.length} รายการ
                    </Tag>
                    {row.components.map((c) => (
                        <div key={c.product_id}>{productLink({ id: c.product_id, sku: c.sku, name: c.name }, `×${c.quantity}`)}</div>
                    ))}
                </div>
            );
        }
        if (!row.product) return <Body>—</Body>;
        return productLink(row.product, row.pack_quantity && row.pack_quantity > 1 ? `แพ็ก ×${row.pack_quantity}` : undefined);
    };

    const suggestionCell = (row: ListingRow) => {
        const top = row.suggestions[0];
        if (!top) return <Caption>— ไม่มีคำแนะนำ —</Caption>;
        return (
            <div className={pm.cellStack} title={top.reason}>
                <HStack gap="0.25rem" wrap>
                    <Tag design={top.type === 'bundle' ? 'Set2' : 'Information'} colorScheme={top.type === 'bundle' ? '6' : undefined} hideStateIcon>
                        {suggestionTag(top)}
                    </Tag>
                    <Tag design={top.confidence === 'high' ? 'Positive' : top.confidence === 'medium' ? 'Critical' : 'Neutral'} hideStateIcon>
                        {CONFIDENCE_LABEL[top.confidence]}
                    </Tag>
                </HStack>
                <Body style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    {top.items.map((i) => (i.quantity > 1 ? `${i.sku} ×${i.quantity}` : i.sku)).join(' + ')}
                </Body>
                {top.items.length === 1 && top.items[0].name && <Caption>{top.items[0].name}</Caption>}
                <Caption>{top.reason}</Caption>
                {row.suggestions.length > 1 && <Caption>+ อีก {row.suggestions.length - 1} คำแนะนำ (ดูใน &quot;ผูกเอง&quot;)</Caption>}
            </div>
        );
    };

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

    const unmatchedActions = (row: ListingRow) =>
        canMatch ? (
            <div className={pm.actions}>
                {row.suggestions[0] && (
                    <Button
                        design="Emphasized"
                        icon="accept"
                        disabled={busyId === row.id}
                        loading={busyId === row.id}
                        loadingDelay={0}
                        onClick={() => accept(row)}
                    >
                        ยืนยัน
                    </Button>
                )}
                <Button design="Default" icon="chain-link" disabled={busyId === row.id} onClick={() => setLinkTarget(row)}>
                    ผูกเอง
                </Button>
                <Button
                    design="Transparent"
                    icon="hide"
                    disabled={busyId === row.id}
                    onClick={() => {
                        setIgnoreReason('');
                        setIgnoreTarget(row);
                    }}
                >
                    ซ่อน
                </Button>
            </div>
        ) : null;

    const matchedActions = (row: ListingRow) =>
        canMatch ? (
            <div className={pm.actions}>
                <Button design="Default" icon="chain-link" disabled={busyId === row.id} onClick={() => setLinkTarget(row)}>
                    เปลี่ยน
                </Button>
                <Button
                    design="Transparent"
                    icon="disconnected"
                    disabled={busyId === row.id}
                    loading={busyId === row.id}
                    loadingDelay={0}
                    onClick={() => unlink(row)}
                >
                    ยกเลิกการผูก
                </Button>
            </div>
        ) : null;

    const ignoredActions = (row: ListingRow) =>
        canMatch ? (
            <div className={pm.actions}>
                <Button
                    design="Default"
                    icon="show"
                    disabled={busyId === row.id}
                    loading={busyId === row.id}
                    loadingDelay={0}
                    onClick={() => postAction(row, 'unignore')}
                >
                    เลิกซ่อน
                </Button>
            </div>
        ) : null;

    const commonListingColumns: FioriResponsiveColumn<ListingRow>[] = [
        { key: 'status', header: 'สถานะ', priority: 'low', minWidth: 110, render: statusCell },
        { key: 'price', header: 'ราคา', priority: 'low', align: 'right', minWidth: 90, render: (row) => <Body>{row.price ?? '—'}</Body> },
        { key: 'quantity', header: 'คงเหลือ', priority: 'low', align: 'right', minWidth: 80, render: (row) => <Body>{row.quantity ?? '—'}</Body> },
        { key: 'open', header: '', popinText: platformLabel, priority: 'always', align: 'right', minWidth: 48, render: openCell },
    ];

    const matchedColumns: FioriResponsiveColumn<ListingRow>[] = [
        { key: 'listing', header: `Listing บน ${platformLabel}`, priority: 'always', minWidth: 260, render: listingCell },
        { key: 'product', header: 'สินค้าใน PIM', priority: 'high', minWidth: 200, render: linkedCell },
        {
            key: 'match',
            header: 'วิธีจับคู่',
            priority: 'medium',
            minWidth: 130,
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
        { key: 'actions', header: '', popinText: 'จัดการ', priority: 'high', minWidth: 200, render: matchedActions },
        ...commonListingColumns,
    ];

    const unmatchedColumns: FioriResponsiveColumn<ListingRow>[] = [
        { key: 'listing', header: `Listing บน ${platformLabel}`, priority: 'always', minWidth: 260, render: listingCell },
        { key: 'suggestion', header: 'คำแนะนำ', priority: 'high', minWidth: 220, render: suggestionCell },
        { key: 'actions', header: '', popinText: 'จัดการ', priority: 'high', minWidth: 240, render: unmatchedActions },
        ...commonListingColumns,
    ];

    const ignoredColumns: FioriResponsiveColumn<ListingRow>[] = [
        { key: 'listing', header: `Listing บน ${platformLabel}`, priority: 'always', minWidth: 260, render: listingCell },
        {
            key: 'reason',
            header: 'เหตุผลที่ซ่อน',
            priority: 'high',
            minWidth: 200,
            render: (row) => (
                <div className={pm.cellStack}>
                    <Body>{row.ignore_reason || '—'}</Body>
                    <Caption>
                        {row.ignored_by ?? 'ไม่ทราบผู้ใช้'} · {formatDateTime(row.ignored_at)}
                    </Caption>
                </div>
            ),
        },
        { key: 'actions', header: '', popinText: 'จัดการ', priority: 'high', minWidth: 120, render: ignoredActions },
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

    const listingColumns = filters.tab === 'matched' ? matchedColumns : filters.tab === 'ignored' ? ignoredColumns : unmatchedColumns;
    const selectable = canMatch && (filters.tab === 'unmatched' || filters.tab === 'suggested');

    const currentPage = rows?.current_page ?? 1;
    const lastPage = rows?.last_page ?? 1;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="จับคู่สินค้า (Product Matching)" />
            <div className={styles.page}>
                <PageHeader
                    title="จับคู่สินค้า (Product Matching)"
                    subtitle="Listing จริงบนแต่ละร้าน เทียบกับสินค้าใน PIM — จับคู่อัตโนมัติด้วย SKU ที่ตรงกัน พร้อมคำแนะนำสำหรับแพ็ก / ชุดรวม / SKU ใกล้เคียง (แก้เฉพาะข้อมูลใน PIM ไม่แก้อะไรบนร้าน)"
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
                                    {selectable && (
                                        <Button
                                            design="Emphasized"
                                            icon="accept"
                                            disabled={selected.length === 0 || bulkBusy}
                                            loading={bulkBusy}
                                            loadingDelay={0}
                                            tooltip="ยืนยันคำแนะนำอันดับแรกของแถวที่เลือก — เฉพาะคำแนะนำที่มั่นใจสูง (SKU ใกล้เคียง / แพ็ก _N) ที่เหลือจะถูกข้าม"
                                            onClick={bulkAccept}
                                        >
                                            ยืนยันคำแนะนำที่เลือก{selected.length > 0 ? ` (${selected.length})` : ''}
                                        </Button>
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
                                        columns={listingColumns}
                                        rows={rows.data as ListingRow[]}
                                        getRowKey={(row: ListingRow) => row.id}
                                        emptyMessage="ไม่พบ listing ที่ตรงตามเงื่อนไข"
                                        selectedKeys={selectable ? selected : undefined}
                                        onSelectionChange={selectable ? setSelected : undefined}
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

            <ProductMatchingLinkDialog listing={linkTarget} pageUrl={PAGE_URL} onClose={() => setLinkTarget(null)} />

            <Dialog
                open={ignoreTarget !== null}
                onClose={() => setIgnoreTarget(null)}
                style={{ width: 'min(444px, calc(100vw - 2rem))' }}
                header={
                    <div style={{ width: '100%', padding: '0.5rem 0' }}>
                        <Title level="H5" size="H5" wrappingType="Normal">
                            ซ่อน listing นี้?
                        </Title>
                        <Body style={{ color: TONE_TEXT.neutral, marginTop: '0.125rem' }}>
                            {ignoreTarget?.seller_sku ?? `Item ${ignoreTarget?.item_id ?? ''}`}
                        </Body>
                    </div>
                }
                footer={
                    <Bar
                        design="Footer"
                        endContent={
                            <>
                                <Button design="Transparent" onClick={() => setIgnoreTarget(null)}>
                                    ยกเลิก
                                </Button>
                                <Button
                                    design="Emphasized"
                                    disabled={busyId !== null}
                                    loading={busyId !== null && busyId === ignoreTarget?.id}
                                    loadingDelay={0}
                                    onClick={submitIgnore}
                                >
                                    ซ่อน
                                </Button>
                            </>
                        }
                    />
                }
            >
                <div className={pm.dialogBody}>
                    <Body style={{ color: TONE_TEXT.neutral }}>
                        listing ที่ซ่อนจะไม่อยู่ในรายการ &quot;ยังไม่มีคู่&quot; และการซิงค์จะไม่จับคู่อัตโนมัติให้ — เลิกซ่อนได้ภายหลังที่แท็บ
                        &quot;ซ่อนไว้&quot;
                    </Body>
                    <div className={pm.dialogField}>
                        <Label showColon={false} for="pm-ignore-reason">
                            เหตุผล (ไม่บังคับ)
                        </Label>
                        <Input
                            id="pm-ignore-reason"
                            value={ignoreReason}
                            maxlength={255}
                            placeholder="เช่น ของแถม / สินค้าไม่มีใน PIM"
                            style={{ width: '100%' }}
                            onInput={(e) => setIgnoreReason(e.target.value)}
                        />
                    </div>
                </div>
            </Dialog>

            {confirmElement}
        </AppLayout>
    );
}
