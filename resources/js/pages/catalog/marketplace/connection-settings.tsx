import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Text, Title } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

import styles from './marketplace.module.css';

type MarketplacePlatform = 'shopee' | 'lazada' | 'tiktok' | 'woocommerce';

// เหมือนกับ PLATFORM_LABEL ใน platform-hub.tsx — ทั้งสองหน้าไม่ได้ share
// component เดียวกัน (หน้านี้เป็น table list, หน้านั้นเป็น card launcher) เลย
// คงชุด mapping ไว้แยกกัน แต่ค่าต้องตรงกันเป๊ะ
const PLATFORM_LABEL: Record<MarketplacePlatform, string> = {
    shopee: 'Shopee',
    lazada: 'Lazada',
    tiktok: 'TikTok',
    woocommerce: 'WooCommerce',
};

interface ShopItem {
    id: number;
    code: string;
    name: string;
    lazada_seller_account_id: number | null;
    shopee_seller_account_id: string | null;
    tiktok_seller_account_id: number | null;
    is_active: boolean;
}

interface Props {
    platform: MarketplacePlatform;
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
 * "ตั้งค่าการเชื่อมต่อ" ของแต่ละแพลตฟอร์ม (มาสเตอร์ > มาร์เก็ตเพลส > {แพลตฟอร์ม}
 * > ตั้งค่าการเชื่อมต่อ — การ์ดจาก platform-hub.tsx พามาที่นี่) เดิมเป็นแค่
 * placeholder "under construction" ตอนนี้เป็นขั้นแรกจริง: ตารางร้านค้า
 * (SalesPlatformShop) ที่ผูกกับแพลตฟอร์มนี้อยู่ — โชว์อย่างเดียวก่อน ยังไม่มี
 * เพิ่ม/แก้ไข/ลบในหน้านี้ (ใช้หน้า Catalog > ช่องทางขาย > Platforms
 * (/catalog/sales-platforms) ที่มี CRUD ครบอยู่แล้วไปพลางก่อน) รอต่อยอดเป็น
 * flow เชื่อมต่อร้านค้าเต็มรูปแบบทีหลัง — ดู
 * SalesPlatformController::connectionSettings()
 */
export default function MarketplaceConnectionSettings({ platform, shops }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const platformLabel = PLATFORM_LABEL[platform] ?? platform;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '/catalog/marketplace' },
        { title: platformLabel, href: `/catalog/marketplace/product-master?platform=${platform}` },
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
                    <Text className={styles.subtitle}>{platformLabel}</Text>
                </div>

                <div className={styles.card} style={{ padding: '1rem' }}>
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
