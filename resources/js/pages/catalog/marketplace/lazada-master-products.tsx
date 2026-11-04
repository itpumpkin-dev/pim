import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/action.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import { Avatar, Button, Option, Select } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';

import { Body, Caption, HStack, PageHeader, Pager, SearchField, TONE_TEXT } from './marketplace-ui';
import styles from './marketplace.module.css';

interface ShopOption {
    id: number;
    name: string;
}

interface MasterProductRow {
    id: number;
    item_id: string;
    seller_sku: string;
    shop_sku: string | null;
    name: string | null;
    status: string | null;
    quantity: number | null;
    price: string | null;
    image_url: string | null;
    lazada_url: string | null;
    last_synced_at: string | null;
    shop: { id: number; name: string } | null;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    products: Paginated<MasterProductRow>;
    shops: ShopOption[];
    filters: { search: string; shop_id: number | null; per_page: number };
    totalCached: number;
}

/**
 * "Master Product List" ของ Lazada — โชว์ทุก listing ที่จริงๆ อยู่บน Lazada
 * (cache ไว้ในตาราง lazada_products โดย LazadaProductSyncService::
 * syncMasterProductList()) ไม่ผูกกับ PIM Product เลย — ต่างจาก
 * lazada-products.tsx (Product Mapping) ที่เริ่มจากฝั่ง PIM Product แล้วไปหา
 * mapping หน้านี้เริ่มจากฝั่ง Lazada แล้วโชว์ว่าจริงๆ มีอะไรอยู่บนนั้นบ้าง —
 * ดู LazadaMasterProductsController's docblock
 */
export default function LazadaMasterProducts({ products, shops, filters, totalCached }: Props) {
    const { auth } = usePage<SharedData>().props;
    // ปุ่ม sync เขียนข้อมูล (permission แยกจาก list_marketplace_lazada ที่ใช้เปิด
    // หน้านี้ได้ — ดู routes/catalog.php) เมื่อก่อนโชว์ให้ทุกคนที่เข้าหน้านี้ได้เห็น
    // ปุ่มเสมอ แม้ role จะไม่มีสิทธิ์ sync ก็ตาม กดแล้วเจอ 403 เงียบๆ โดยไม่รู้สาเหตุ
    // — ซ่อนปุ่มไปเลยถ้าไม่มีสิทธิ์จริง เหมือนปุ่มเขียนข้อมูลอื่นๆ ในระบบนี้
    const canSync = (auth.permissions || []).includes('marketplace_lazada.sync_master_products_lazada');
    const [search, setSearch] = useState(filters.search ?? '');
    const [shopId, setShopId] = useState<number | ''>(filters.shop_id ?? '');
    const [perPage, setPerPage] = useState<number>(filters.per_page ?? 25);
    const [syncing, setSyncing] = useState(false);
    const firstRender = useRef(true);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Catalog', href: '#' },
        { title: 'Master', href: '#' },
        { title: 'Marketplace', href: '#' },
        { title: 'Lazada', href: '/catalog/marketplace/lazada' },
        { title: 'Master Product List', href: '#' },
    ];

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get(
                '/catalog/marketplace/lazada/master-products',
                { search, shop_id: shopId || undefined, per_page: perPage },
                { preserveState: true, replace: true },
            );
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const applyShopFilter = (value: number | '') => {
        setShopId(value);
        router.get(
            '/catalog/marketplace/lazada/master-products',
            { search, shop_id: value || undefined, per_page: perPage },
            { preserveState: true },
        );
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/marketplace/lazada/master-products', { search, shop_id: shopId || undefined, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get(
            '/catalog/marketplace/lazada/master-products',
            { search, shop_id: shopId || undefined, per_page: perPage, page },
            { preserveState: true },
        );
    };

    // ไม่มี concept "ลบ/เขียนทับข้อมูลจริงบน Lazada" เลย (อ่านอย่างเดียว) — เลย
    // ไม่ต้องมี confirm dialog เตือนแบบปุ่ม sync attribute family/mapping อื่นๆ
    // ในระบบนี้ แค่บอก loading state เฉยๆ ก็พอ
    const syncNow = () => {
        setSyncing(true);
        router.post(
            '/catalog/marketplace/lazada/master-products/sync',
            {},
            {
                preserveScroll: true,
                onFinish: () => setSyncing(false),
            },
        );
    };

    const currentPage = products.current_page ?? 1;
    const lastPage = products.last_page ?? 1;

    const columns: FioriResponsiveColumn<MasterProductRow>[] = [
        {
            key: 'product',
            header: 'สินค้า',
            priority: 'always',
            minWidth: 260,
            render: (row) => (
                <HStack gap="0.75rem">
                    <Avatar shape="Square" size="XS" style={{ width: 40, height: 40, background: 'var(--sapList_HeaderBackground)' }}>
                        {row.image_url ? <img src={row.image_url} alt="" /> : undefined}
                    </Avatar>
                    <div>
                        <Body style={{ fontWeight: 600 }}>{row.name || row.seller_sku}</Body>
                        <Caption mono>{row.seller_sku}</Caption>
                    </div>
                </HStack>
            ),
        },
        {
            key: 'shop',
            header: 'ร้าน',
            priority: 'high',
            minWidth: 160,
            render: (row) => <Body>{row.shop?.name ?? '—'}</Body>,
        },
        {
            key: 'status',
            header: 'สถานะบน Lazada',
            priority: 'high',
            minWidth: 140,
            render: (row) => (
                <Body style={{ color: row.status?.toLowerCase() === 'active' ? TONE_TEXT.success : TONE_TEXT.neutral, fontWeight: 600 }}>
                    {row.status ?? '—'}
                </Body>
            ),
        },
        {
            key: 'quantity',
            header: 'คงเหลือ',
            priority: 'medium',
            align: 'right',
            minWidth: 90,
            render: (row) => <Body>{row.quantity ?? '—'}</Body>,
        },
        {
            key: 'price',
            header: 'ราคา',
            priority: 'medium',
            align: 'right',
            minWidth: 100,
            render: (row) => <Body>{row.price ?? '—'}</Body>,
        },
        {
            key: 'item_id',
            header: 'Item ID',
            priority: 'low',
            minWidth: 120,
            render: (row) => <Caption mono>{row.item_id}</Caption>,
        },
        {
            key: 'action',
            header: '',
            popinText: 'Lazada',
            priority: 'always',
            align: 'right',
            minWidth: 48,
            render: (row) =>
                row.lazada_url ? (
                    <Button
                        design="Transparent"
                        icon="action"
                        tooltip="Lazada"
                        accessibleName="Open on Lazada"
                        onClick={() => window.open(row.lazada_url ?? undefined, '_blank', 'noopener,noreferrer')}
                    />
                ) : null,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Lazada Master Product List" />
            <div className={styles.page}>
                <PageHeader
                    title={`Master Product List — Lazada (${totalCached})`}
                    subtitle="สินค้าที่จริงๆ อยู่บน Lazada ทุกร้าน (cache ไว้ดู ไม่ผูกกับสินค้าใน PIM)"
                    actions={
                        canSync && (
                            <Button design="Emphasized" icon="synchronize" disabled={syncing} loading={syncing} loadingDelay={0} onClick={syncNow}>
                                {syncing ? 'กำลัง Sync...' : 'Sync ทุกร้านตอนนี้'}
                            </Button>
                        )
                    }
                />

                <div className={styles.card}>
                    <div className={styles.toolbar}>
                        <div className={styles.toolbarStart}>
                            <SearchField value={search} onChange={setSearch} placeholder="ค้นหาตามชื่อสินค้า หรือ SKU..." />
                            <Select
                                value={shopId === '' ? '' : String(shopId)}
                                onChange={(e) => {
                                    const v = e.detail.selectedOption.value ?? '';
                                    applyShopFilter(v === '' ? '' : Number(v));
                                }}
                                style={{ minWidth: 180 }}
                                accessibleName="ร้าน"
                            >
                                <Option value="">ทุกร้าน</Option>
                                {shops.map((shop) => (
                                    <Option key={shop.id} value={String(shop.id)}>
                                        {shop.name}
                                    </Option>
                                ))}
                            </Select>
                        </div>

                        <Pager
                            currentPage={currentPage}
                            lastPage={lastPage}
                            perPage={perPage}
                            perPageLabel="ต่อหน้า"
                            onPerPageChange={handlePerPageChange}
                            onGoToPage={goToPage}
                        />
                    </div>

                    <div className={styles.divider} />

                    {totalCached === 0 ? (
                        <div style={{ padding: '2rem' }}>
                            <FioriMessageStrip severity="information">
                                {canSync
                                    ? 'ยังไม่มีข้อมูล Master Product List เลย — กด "Sync ทุกร้านตอนนี้" เพื่อดึงข้อมูลจาก Lazada มาเก็บไว้ครั้งแรก'
                                    : 'ยังไม่มีข้อมูล Master Product List เลย — ให้ผู้มีสิทธิ์ sync ดึงข้อมูลจาก Lazada มาเก็บไว้ก่อน'}
                            </FioriMessageStrip>
                        </div>
                    ) : (
                        <FioriResponsiveTable
                            variant="plain"
                            columns={columns}
                            rows={products.data}
                            getRowKey={(row: MasterProductRow) => row.id}
                            emptyMessage="ไม่พบสินค้าที่ตรงตามเงื่อนไข"
                        />
                    )}

                    <div className={styles.footer} style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}>
                        <Caption>
                            แสดง {products.data.length} จาก {products.total} รายการ
                        </Caption>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
