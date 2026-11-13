import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriBusyIndicator, useFioriBusy } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/action.js';
import '@ui5/webcomponents-icons/dist/chain-link.js';
import '@ui5/webcomponents-icons/dist/decline.js';
import '@ui5/webcomponents-icons/dist/detail-view.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/status-positive.js';
import {
    Avatar,
    Button,
    Icon,
    Label,
    Link,
    ObjectStatus,
    Option,
    SegmentedButton,
    SegmentedButtonItem,
    Select,
    Text,
} from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';

import { PageHeader, Pager, SearchField, lastMappingPlatform } from './marketplace-ui';
import styles from './marketplace.module.css';
import { ProductMatchingDetailDialog } from './product-matching-detail-dialog';

type Platform = 'lazada' | 'shopee' | 'tiktok' | 'woocommerce';
type MatchingFilter = 'all' | 'matched' | 'unmatched';
type StatusFilter = 'all' | 'active' | 'inactive';

interface PimRef {
    id: number;
    sku: string;
    name: string | null;
}

interface Row {
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
    last_synced_at: string | null;
    /** last time the synced data (sku / name / status / price / qty / image / url) actually changed — first seen until then */
    data_changed_at: string | null;
    shop: string | null;
    platform: Platform | string;
    mapping_ids: number[];
    detail: { brand: string | null; category: string | null; image_count: number; weight_kg: number | null; fetched_at: string | null } | null;
    pim: { type: 'single' | 'bundle'; pack_quantity: number | null; products: PimRef[] } | null;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    platforms: { value: Platform; label: string }[];
    shops: { id: number; name: string; platform: Platform | null }[];
    rows: Paginated<Row>;
    stats: { total: number; active: number; matched: number; last_synced_at: string | null };
    filters: { platform: Platform | null; shop_id: number | null; search: string; matching: MatchingFilter; status: StatusFilter; per_page: number };
}

const PLATFORM_LABEL: Record<string, string> = { shopee: 'Shopee', lazada: 'Lazada', tiktok: 'TikTok', woocommerce: 'WooCommerce' };
const PLATFORM_STATE: Record<string, 'Critical' | 'Information' | 'Positive' | 'Indication05'> = {
    shopee: 'Critical',
    lazada: 'Information',
    tiktok: 'Indication05',
    woocommerce: 'Positive',
};
const MAPPING_PLATFORMS: Platform[] = ['shopee', 'lazada', 'tiktok', 'woocommerce'];

const number = (n: number) => n.toLocaleString('th-TH');
const money = (v: string | null) => (v === null || v === '' ? '—' : `฿${Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`);
const dateTime = (v: string | null) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * "Marketplace Product Master" (มาสเตอร์ > มาร์เก็ตเพลส) — ทุก listing ที่ร้านของทุก platform ขายอยู่จริง แยกด้วยคอลัมน์ Platform (ข้อมูลจากการซิงค์
 * listing ของหน้าจับคู่สินค้า) + รายละเอียดสินค้าที่ดึงไว้ + สินค้าใน PIM ที่จับคู่ไว้ อ่านอย่างเดียว —
 * คลิกแถวเพื่อดูรายละเอียดเต็ม (dialog ตัวเดียวกับหน้าจับคู่สินค้า) ดู MarketplaceProductMasterController
 */
export default function ProductMaster({ platforms, shops, rows, stats, filters }: Props) {
    const { auth } = usePage<SharedData>().props;
    const canEdit = (auth.permissions || []).includes('products.edit_products');
    const pageUrl = '/catalog/marketplace/product-master';
    // แถวที่ติ๊กไว้ (คงไว้ข้ามหน้า/ข้ามการกรอง) — เก็บ platform + PIM product ids ไว้ด้วย เพราะแถวจาก
    // หน้าอื่นไม่อยู่ใน rows.data แล้ว ปุ่ม จับคู่สินค้า / Product Mapping ส่งเป็น ?ids= ให้หน้าปลายทาง
    // กรองเฉพาะสินค้านั้นทันที ไม่ต้องค้นหาซ้ำ (ไม่ติ๊กอะไร = เปิดแบบแสดงทั้งหมดตามปกติ)
    const [selected, setSelected] = useState<Record<number, { platform: string; mapping_ids: number[] }>>({});
    const selectedIds = Object.keys(selected).map(Number);
    const selectedMappingIds = (platform?: string) => [
        ...new Set(
            Object.values(selected)
                .filter((s) => !platform || s.platform === platform)
                .flatMap((s) => s.mapping_ids),
        ),
    ];
    // ปุ่ม Product Mapping พาเข้าหน้าเลยไม่ต้องเลือก platform ก่อน (สลับ platform ได้ที่หัวหน้านั้น —
    // MappingPlatformSwitch): ติ๊กไว้ → platform ที่มีแถวที่เลือกมากสุด / กรอง platform อยู่ → ตัวนั้น /
    // "ทุก platform" → ตัวที่เปิดล่าสุด ส่ง ids ของทุกแถวที่ติ๊กไป (เป็น PIM product id ใช้ได้ทุก platform)
    const targetMappingPlatform = (): Platform => {
        if (selectedIds.length > 0) {
            const counts = new Map<Platform, number>();
            Object.values(selected).forEach((s) => {
                const p = s.platform as Platform;
                if (s.mapping_ids.length > 0 && MAPPING_PLATFORMS.includes(p)) counts.set(p, (counts.get(p) ?? 0) + 1);
            });
            const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            if (best) return best;
        }
        if (filters.platform && MAPPING_PLATFORMS.includes(filters.platform)) return filters.platform;
        return lastMappingPlatform();
    };

    const onSelectionChange = (keys: string[]) => {
        setSelected((prev) => {
            const next: typeof prev = {};
            for (const key of keys.map(Number)) {
                const row = rows.data.find((r) => r.id === key);
                const known = row ? { platform: String(row.platform), mapping_ids: row.mapping_ids } : prev[key];
                if (known) next[key] = known;
            }
            return next;
        });
    };

    const goToMatching = () => {
        const params = new URLSearchParams();
        if (selectedIds.length > 0) params.set('ids', selectedIds.join(','));
        else if (filters.platform) params.set('platform', filters.platform);
        router.visit(`/catalog/marketplace/product-matching${params.size ? `?${params}` : ''}`);
    };
    const goToMapping = (platform: Platform) => {
        const ids = selectedMappingIds();
        router.visit(`/catalog/marketplace/${platform}/products${selectedIds.length > 0 && ids.length > 0 ? `?ids=${ids.join(',')}` : ''}`);
    };

    const [search, setSearch] = useState(filters.search ?? '');
    const [detailTarget, setDetailTarget] = useState<Row | null>(null);
    const [navigating, setNavigating] = useState(false);
    const showBusy = useFioriBusy(navigating, 150);

    const visit = (overrides: Partial<Props['filters']> & { page?: number } = {}, replace = false) => {
        const next = { ...filters, search, ...overrides };
        router.get(
            pageUrl,
            {
                platform: next.platform ?? undefined,
                shop_id: next.shop_id ?? undefined,
                search: next.search || undefined,
                matching: next.matching !== 'all' ? next.matching : undefined,
                status: next.status !== 'all' ? next.status : undefined,
                per_page: next.per_page,
                page: overrides.page,
            },
            { preserveState: true, preserveScroll: true, replace, onStart: () => setNavigating(true), onFinish: () => setNavigating(false) },
        );
    };

    // search: debounce, skip the first render
    const firstRender = useRef(true);
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timer = setTimeout(() => visit({ search }, true), 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Catalog', href: '#' },
        { title: 'Master', href: '#' },
        { title: 'Marketplace', href: '/catalog/marketplace' },
        { title: 'Marketplace Product Master', href: pageUrl },
    ];

    const pimCell = (row: Row) => {
        if (!row.pim) return <ObjectStatus state="Critical">ยังไม่จับคู่</ObjectStatus>;
        return (
            <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', minWidth: 0 }}>
                {row.pim.type === 'bundle' && <Label>ชุดรวม (bundle)</Label>}
                {row.pim.products.map((p) => (
                    <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
                        <Icon name="status-positive" style={{ width: 14, height: 14, color: 'var(--sapPositiveColor)', flexShrink: 0 }} />
                        <Link href={canEdit ? `/catalog/products/${p.id}/edit` : undefined} title={p.name ?? undefined} wrappingType="None">
                            {p.sku}
                        </Link>
                        {row.pim?.pack_quantity && row.pim.pack_quantity > 1 && <Label>× {row.pim.pack_quantity}</Label>}
                    </span>
                ))}
            </span>
        );
    };

    const columns: FioriResponsiveColumn<Row>[] = [
        {
            key: 'platform',
            header: 'Platform',
            priority: 'always',
            minWidth: 110,
            render: (row) => (
                <ObjectStatus state={PLATFORM_STATE[row.platform] ?? 'None'} inverted>
                    {PLATFORM_LABEL[row.platform] ?? row.platform}
                </ObjectStatus>
            ),
        },
        {
            key: 'listing',
            header: 'สินค้า',
            priority: 'always',
            minWidth: 280,
            render: (row) => (
                <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: 0 }}>
                    <Avatar shape="Square" size="XS" style={{ width: 44, height: 44, flexShrink: 0, background: 'var(--sapList_HeaderBackground)' }}>
                        {row.image_url ? <img src={row.image_url} alt="" /> : undefined}
                    </Avatar>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', minWidth: 0 }}>
                        <Text maxLines={2} style={{ fontWeight: 600 }}>
                            {row.name || row.seller_sku || '—'}
                        </Text>
                        <Label style={{ fontFamily: 'var(--sapFontFamilyMono, monospace)' }}>
                            {row.seller_sku ?? '(ไม่มี SKU)'} · Item {row.item_id}
                            {row.variant_id ? ` · Var ${row.variant_id}` : ''}
                        </Label>
                    </span>
                </span>
            ),
        },
        { key: 'shop', header: 'ร้าน', priority: 'medium', minWidth: 140, render: (row) => <Text maxLines={2}>{row.shop ?? '—'}</Text> },
        {
            key: 'info',
            header: 'แบรนด์ / หมวดหมู่',
            priority: 'medium',
            minWidth: 180,
            render: (row) =>
                row.detail ? (
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                        <Text>{row.detail.brand ?? '—'}</Text>
                        <Label wrappingType="Normal">{row.detail.category ?? '—'}</Label>
                    </span>
                ) : (
                    <Label title="ยังไม่ได้ดึงรายละเอียด — คลิกแถวเพื่อดึง">ยังไม่ได้ดึงรายละเอียด</Label>
                ),
        },
        { key: 'price', header: 'ราคา', priority: 'high', align: 'right', minWidth: 90, render: (row) => <Text>{money(row.price)}</Text> },
        {
            key: 'quantity',
            header: 'สต็อก',
            priority: 'high',
            align: 'right',
            minWidth: 70,
            render: (row) => <Text>{row.quantity === null ? '—' : number(row.quantity)}</Text>,
        },
        {
            key: 'status',
            header: 'สถานะ',
            priority: 'high',
            minWidth: 110,
            render: (row) => (
                <ObjectStatus state={row.is_active ? 'Positive' : 'None'}>{row.status ?? (row.is_active ? 'active' : 'inactive')}</ObjectStatus>
            ),
        },
        {
            key: 'changed',
            header: 'เปลี่ยนแปลงล่าสุด',
            priority: 'low',
            minWidth: 130,
            render: (row) => (
                <Text title="ครั้งล่าสุดที่ข้อมูลจากร้าน (SKU ชื่อ สถานะ ราคา สต็อก รูป ลิงก์) เปลี่ยน — นับตั้งแต่ระบบเริ่มเก็บ ก่อนหน้านั้นคือวันที่พบครั้งแรก">
                    {dateTime(row.data_changed_at)}
                </Text>
            ),
        },
        {
            key: 'synced',
            header: 'ซิงค์ล่าสุด',
            priority: 'low',
            minWidth: 130,
            render: (row) => <Text>{dateTime(row.last_synced_at)}</Text>,
        },
        { key: 'pim', header: 'สินค้าใน PIM', priority: 'high', minWidth: 160, render: pimCell },
        {
            key: 'actions',
            header: '',
            popinText: 'จัดการ',
            priority: 'always',
            align: 'right',
            minWidth: 96,
            render: (row) => (
                <span style={{ display: 'inline-flex', gap: '0.125rem' }}>
                    <Button
                        design="Transparent"
                        icon="detail-view"
                        tooltip="รายละเอียดสินค้าบนแพลตฟอร์ม"
                        accessibleName="รายละเอียด"
                        onClick={() => setDetailTarget(row)}
                    />
                    {row.url && (
                        <Button
                            design="Transparent"
                            icon="action"
                            tooltip={`เปิดบน ${PLATFORM_LABEL[row.platform] ?? row.platform}`}
                            accessibleName={`เปิดบน ${PLATFORM_LABEL[row.platform] ?? row.platform}`}
                            onClick={() => window.open(row.url ?? undefined, '_blank', 'noopener,noreferrer')}
                        />
                    )}
                </span>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Marketplace Product Master" />
            <div className={styles.page}>
                <PageHeader
                    title="Marketplace Product Master"
                    subtitle="สินค้าทั้งหมดที่ดึงมาจากทุกร้าน แยกตาม platform (จากการซิงค์ listing) พร้อมรายละเอียดสินค้าและสินค้าใน PIM ที่จับคู่ไว้ — อ่านอย่างเดียว คลิกแถวเพื่อดูรายละเอียดเต็ม"
                    actions={
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {selectedIds.length > 0 && (
                                <>
                                    <Label>เลือกอยู่ {number(selectedIds.length)} รายการ</Label>
                                    <Button design="Transparent" icon="decline" onClick={() => setSelected({})}>
                                        ล้าง
                                    </Button>
                                </>
                            )}
                            <Button icon="chain-link" onClick={goToMatching}>
                                จับคู่สินค้า (Product Matching){selectedIds.length > 0 ? ` (${number(selectedIds.length)})` : ''}
                            </Button>
                            <Button
                                design="Emphasized"
                                icon="product"
                                disabled={selectedIds.length > 0 && selectedMappingIds().length === 0}
                                tooltip={
                                    selectedIds.length > 0 && selectedMappingIds().length === 0
                                        ? 'สินค้าที่เลือกยังไม่ได้จับคู่กับ PIM — ไม่มีสินค้าให้แมพ (จับคู่ก่อน)'
                                        : 'สลับ platform ได้ที่หน้าถัดไป'
                                }
                                onClick={() => goToMapping(targetMappingPlatform())}
                            >
                                สินค้า (Product Mapping)
                                {filters.platform ? ` · ${PLATFORM_LABEL[filters.platform]}` : ''}
                                {selectedIds.length > 0 && selectedMappingIds().length > 0 ? ` (${number(selectedMappingIds().length)})` : ''}
                            </Button>
                        </div>
                    }
                />

                {shops.length === 0 ? (
                    <FioriMessageStrip severity="information">ไม่มีร้านที่คุณมีสิทธิ์เข้าถึง</FioriMessageStrip>
                ) : (
                    <div className={styles.card}>
                        {/* สรุป */}
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '1.5rem',
                                padding: '1rem 1.25rem',
                                borderBottom: '1px solid var(--sapGroup_ContentBorderColor)',
                            }}
                        >
                            {[
                                { label: 'สินค้าทั้งหมด', value: number(stats.total) },
                                { label: 'เปิดขาย', value: number(stats.active) },
                                { label: 'จับคู่กับ PIM แล้ว', value: number(stats.matched) },
                                { label: 'ซิงค์ล่าสุด', value: dateTime(stats.last_synced_at) },
                            ].map((k) => (
                                <span key={k.label} style={{ display: 'flex', flexDirection: 'column' }}>
                                    <Label>{k.label}</Label>
                                    <Text style={{ fontSize: 'var(--sapFontLargeSize)', fontWeight: 700 }}>{k.value}</Text>
                                </span>
                            ))}
                        </div>

                        {/* Toolbar */}
                        <div className={styles.toolbar}>
                            <div className={styles.toolbarStart}>
                                <SegmentedButton
                                    accessibleName="Platform"
                                    onSelectionChange={(e) => {
                                        const v = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.value;
                                        if (v !== undefined) visit({ platform: (v || null) as Platform | null, shop_id: null });
                                    }}
                                >
                                    <SegmentedButtonItem data-value="" selected={!filters.platform}>
                                        ทุก platform
                                    </SegmentedButtonItem>
                                    {platforms.map((p) => (
                                        <SegmentedButtonItem key={p.value} data-value={p.value} selected={filters.platform === p.value}>
                                            {p.label}
                                        </SegmentedButtonItem>
                                    ))}
                                </SegmentedButton>
                                <Select
                                    accessibleName="ร้าน"
                                    onChange={(e) => visit({ shop_id: Number(e.detail.selectedOption.value) || null })}
                                    style={{ minWidth: '12rem' }}
                                >
                                    <Option value="0" selected={!filters.shop_id}>
                                        ทุกร้าน ({shops.length})
                                    </Option>
                                    {shops.map((s) => (
                                        <Option key={s.id} value={String(s.id)} selected={filters.shop_id === s.id}>
                                            {filters.platform ? s.name : `${s.name} (${PLATFORM_LABEL[s.platform ?? ''] ?? s.platform})`}
                                        </Option>
                                    ))}
                                </Select>
                                <SearchField value={search} onChange={setSearch} placeholder="ค้นหา ชื่อ, SKU, Item ID หรือ SKU ใน PIM..." />
                                <SegmentedButton
                                    accessibleName="สถานะ"
                                    onSelectionChange={(e) => {
                                        const v = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.value as StatusFilter | undefined;
                                        if (v) visit({ status: v });
                                    }}
                                >
                                    <SegmentedButtonItem data-value="all" selected={filters.status === 'all'}>
                                        ทุกสถานะ
                                    </SegmentedButtonItem>
                                    <SegmentedButtonItem data-value="active" selected={filters.status === 'active'}>
                                        เปิดขาย
                                    </SegmentedButtonItem>
                                    <SegmentedButtonItem data-value="inactive" selected={filters.status === 'inactive'}>
                                        ไม่ได้ขาย
                                    </SegmentedButtonItem>
                                </SegmentedButton>
                                <SegmentedButton
                                    accessibleName="Matching"
                                    onSelectionChange={(e) => {
                                        const v = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.value as MatchingFilter | undefined;
                                        if (v) visit({ matching: v });
                                    }}
                                >
                                    <SegmentedButtonItem data-value="all" selected={filters.matching === 'all'}>
                                        Matching: ทั้งหมด
                                    </SegmentedButtonItem>
                                    <SegmentedButtonItem data-value="matched" selected={filters.matching === 'matched'}>
                                        จับคู่แล้ว
                                    </SegmentedButtonItem>
                                    <SegmentedButtonItem data-value="unmatched" selected={filters.matching === 'unmatched'}>
                                        ยังไม่จับคู่
                                    </SegmentedButtonItem>
                                </SegmentedButton>
                            </div>
                            <Pager
                                currentPage={rows.current_page}
                                lastPage={rows.last_page}
                                perPage={rows.per_page}
                                perPageLabel="ต่อหน้า"
                                onPerPageChange={(value) => visit({ per_page: value })}
                                onGoToPage={(page) => visit({ page })}
                            />
                        </div>

                        <div className={styles.divider} />

                        <div className={styles.busyArea} aria-busy={navigating}>
                            {showBusy && (
                                <div className={styles.busyLayer}>
                                    <FioriBusyIndicator size="M" />
                                </div>
                            )}
                            <FioriResponsiveTable
                                variant="plain"
                                columns={columns}
                                rows={rows.data}
                                getRowKey={(row) => row.id}
                                onRowClick={setDetailTarget}
                                selectedKeys={selectedIds}
                                onSelectionChange={onSelectionChange}
                                emptyMessage={
                                    stats.total === 0
                                        ? `ยังไม่มีข้อมูล — ซิงค์ listing ของร้านที่หน้า "จับคู่สินค้า" ก่อน`
                                        : 'ไม่พบสินค้าที่ตรงตามเงื่อนไข'
                                }
                            />
                        </div>

                        <div style={{ padding: '0.75rem 1.25rem' }}>
                            <Label>
                                แสดง {rows.data.length} จาก {number(rows.total)} รายการ
                            </Label>
                        </div>
                    </div>
                )}
            </div>

            <ProductMatchingDetailDialog
                listing={detailTarget}
                pageUrl="/catalog/marketplace/product-matching"
                canRefresh={canEdit}
                canOpenProduct={canEdit}
                onClose={() => setDetailTarget(null)}
            />
        </AppLayout>
    );
}
