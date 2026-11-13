import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import { ObjectStatus, SegmentedButton, SegmentedButtonItem, Text, Title } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

import styles from './marketplace.module.css';

type MarketplacePlatform = 'shopee' | 'lazada' | 'tiktok' | 'woocommerce';

const PLATFORM_LABEL: Record<string, string> = {
    shopee: 'Shopee',
    lazada: 'Lazada',
    tiktok: 'TikTok',
    woocommerce: 'WooCommerce',
};
// สีเดียวกับคอลัมน์ Platform ใน product-master.tsx
const PLATFORM_STATE: Record<string, 'Critical' | 'Information' | 'Positive' | 'Indication05'> = {
    shopee: 'Critical',
    lazada: 'Information',
    tiktok: 'Indication05',
    woocommerce: 'Positive',
};

interface ShopItem {
    id: number;
    code: string;
    name: string;
    lazada_seller_account_id: number | null;
    shopee_seller_account_id: string | null;
    tiktok_seller_account_id: number | null;
    is_active: boolean;
    platform: MarketplacePlatform;
}

interface Props {
    /** เฉพาะ platform ที่ผู้ใช้มีสิทธิ์ marketplace_{platform}.list_marketplace_{platform} */
    platforms: { value: MarketplacePlatform; label: string }[];
    /** ตัวกรองปัจจุบัน — null = ทุก platform */
    platform: MarketplacePlatform | null;
    shops: ShopItem[];
}

// เหมือนกับ linkedAccountLabel() ใน salesPlatforms/index.tsx — คนละหน้ากัน
// (หน้านั้น list ร้านค้าทุกแพลตฟอร์มพร้อมกันแบบแท็บ ส่วนหน้านี้ list เฉพาะ
// แพลตฟอร์มเดียวจาก URL) เลยไม่ได้ share component เดียวกัน แต่ logic เดียวกัน
function linkedAccountLabel(shop: ShopItem): string | null {
    if (shop.lazada_seller_account_id) return `Lazada #${shop.lazada_seller_account_id}`;
    if (shop.shopee_seller_account_id) return `Shopee #${shop.shopee_seller_account_id}`;
    if (shop.tiktok_seller_account_id) return `TikTok #${shop.tiktok_seller_account_id}`;
    return null;
}

/**
 * "ตั้งค่าการเชื่อมต่อ" (มาสเตอร์ > มาร์เก็ตเพลส > ตั้งค่าการเชื่อมต่อ — การ์ดจาก marketplace-hub.tsx
 * พามาที่นี่) หน้าเดียวรวมทุกแพลตฟอร์ม กรอง platform ด้วย SegmentedButton (?platform=) — ตาราง
 * ร้านค้า (SalesPlatformShop) โชว์อย่างเดียวก่อน ยังไม่มีเพิ่ม/แก้ไข/ลบในหน้านี้ (ใช้หน้า
 * Catalog > ช่องทางขาย > Platforms (/catalog/sales-platforms) ที่มี CRUD ครบไปพลางก่อน) — ดู
 * SalesPlatformController::connectionSettings()
 */
export default function MarketplaceConnectionSettings({ platforms, platform, shops }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '/catalog/marketplace' },
        { title: tNav('marketplaceConnect'), href: '#' },
    ];

    // คอลัมน์เดียวกับตาราง ShopItem ใน salesPlatforms/index.tsx (ชื่อ/โค้ด,
    // บัญชีที่เชื่อมโยง, สถานะเปิดใช้งาน) — ไม่มีคอลัมน์ action เพราะหน้านี้ยัง
    // เป็นแค่ list ดูอย่างเดียว
    const shopColumns: FioriResponsiveColumn<ShopItem>[] = [
        {
            key: 'shop',
            header: t('shopsLabel'),
            priority: 'always',
            render: (shop) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--sapFontSize)', color: 'var(--sapTextColor)' }}>{shop.name}</div>
                    <span className={styles.caption}>{shop.code}</span>
                </div>
            ),
        },
        {
            key: 'platform',
            header: 'Platform',
            priority: 'high',
            render: (shop) => (
                <ObjectStatus state={PLATFORM_STATE[shop.platform] ?? 'None'} inverted>
                    {PLATFORM_LABEL[shop.platform] ?? shop.platform}
                </ObjectStatus>
            ),
        },
        {
            key: 'linkedAccount',
            header: t('linkedPlatformAccount'),
            priority: 'high',
            render: (shop) =>
                linkedAccountLabel(shop) ?? (
                    <span style={{ fontStyle: 'italic', color: 'var(--sapContent_DisabledTextColor, var(--sapContent_LabelColor))' }}>
                        {t('noLinkedAccount')}
                    </span>
                ),
        },
        {
            key: 'active',
            header: t('shopActive'),
            priority: 'medium',
            render: (shop) => (shop.is_active ? <FioriStatus label={t('shopActive')} tone="success" /> : <FioriStatus label="-" tone="neutral" />),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('marketplaceConnect')} />
            <div className={styles.page}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Title level="H4" size="H4" wrappingType="Normal" className={styles.pageTitle}>
                        {tNav('marketplaceConnect')}
                    </Title>
                    <Text className={styles.subtitle}>ร้านค้าและบัญชีผู้ขายที่เชื่อมต่อของแต่ละ platform</Text>
                </div>

                <div className={styles.card}>
                    <div className={styles.toolbar}>
                        <div className={styles.toolbarStart}>
                            <SegmentedButton
                                accessibleName="Platform"
                                onSelectionChange={(e) => {
                                    const v = (e.detail.selectedItems[0] as HTMLElement | undefined)?.dataset.value;
                                    if (v === undefined) return;
                                    router.get('/catalog/marketplace/connect', v ? { platform: v } : {}, {
                                        preserveScroll: true,
                                        preserveState: true,
                                    });
                                }}
                            >
                                <SegmentedButtonItem data-value="" selected={!platform}>
                                    ทุก platform
                                </SegmentedButtonItem>
                                {platforms.map((p) => (
                                    <SegmentedButtonItem key={p.value} data-value={p.value} selected={platform === p.value}>
                                        {p.label}
                                    </SegmentedButtonItem>
                                ))}
                            </SegmentedButton>
                        </div>
                        <Text className={styles.caption}>{shops.length} ร้าน</Text>
                    </div>
                    <FioriResponsiveTable
                        variant="plain"
                        columns={shopColumns}
                        rows={shops}
                        getRowKey={(shop) => shop.id}
                        emptyMessage={t('noShopsYet')}
                    />
                </div>
            </div>
        </AppLayout>
    );
}
