import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/chain-link.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/settings.js';
import '@ui5/webcomponents-icons/dist/synchronize.js';
import '@ui5/webcomponents-icons/dist/tree.js';
import { Icon, Text, Title } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

import styles from './marketplace.module.css';

type MarketplacePlatform = 'shopee' | 'lazada' | 'tiktok' | 'woocommerce';

const PLATFORM_LABEL: Record<MarketplacePlatform, string> = {
    shopee: 'Shopee',
    lazada: 'Lazada',
    tiktok: 'TikTok',
    woocommerce: 'WooCommerce',
};

interface Props {
    platform: MarketplacePlatform;
}

/**
 * หน้า hub ของแต่ละแพลตฟอร์มใต้ มาสเตอร์ > มาร์เก็ตเพลส — แทนที่เมนู sidebar
 * แบบซ้อน 2 ชั้นเดิม (มาร์เก็ตเพลส > การเชื่อมต่อ [4 แพลตฟอร์ม] + มาร์เก็ตเพลส
 * > {แพลตฟอร์ม} > [จับคู่หมวดหมู่, จับคู่ข้อมูลส่ง]) ด้วยเมนูแบนราบ (มาร์เก็ตเพลส
 * > Shopee/Lazada/TikTok/WooCommerce ตรงๆ) ที่แต่ละอันพามาหน้านี้แทน — ให้เห็น
 * ทั้ง 3 การ์ดของแพลตฟอร์มนั้นพร้อมกันในที่เดียว (จับคู่หมวดหมู่, จับคู่ข้อมูลส่ง,
 * ตั้งค่าการเชื่อมต่อ) เหมือนกับ catalog/management (หน้า "จัดการ") ทุกประการ —
 * เป็นแค่ launcher การ์ดพาไปหน้าจริง ไม่มี business logic ของตัวเอง สิทธิ์การ
 * เข้าถึงยังเช็คที่หน้าปลายทางเหมือนเดิม การ์ดจะซ่อนไปเองถ้า user ไม่มีสิทธิ์นั้น
 * (เหมือนกับที่เมนู sidebar เดิมซ่อนอยู่ก่อนหน้านี้)
 *
 * `platform` มาจาก route param เดียวกับที่ marketplace/connect/{platform} เดิม
 * ใช้อยู่แล้ว (ดู routes/catalog.php) — จำกัดแค่ 4 ค่านี้ด้วย whereIn ที่ route
 */
export default function MarketplacePlatformHub({ platform }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];

    const platformLabel = PLATFORM_LABEL[platform] ?? platform;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: platformLabel, href: '#' },
    ];

    // Platform ที่มีหน้า "สินค้า (Product Mapping)" แบบ Object Page เต็มรูปแบบ
    // แล้ว (ไล่แมพ Category & Attributes ตั้งแต่ตัวสินค้าในหน้าเดียว) — ครบทั้ง
    // 4 platform แล้ว: Lazada, Shopee, TikTok (ดู LazadaAttributeMappingController::
    // lazadaProducts()/ShopeeAttributeMappingController::shopeeProducts()/
    // TikTokAttributeMappingController::tiktokProducts()) และ WooCommerce (ดู
    // WooCommerceAttributeMappingController::woocommerceProducts() — Section 2
    // ของ WooCommerce ต่างจาก 3 platform นี้ตรงที่ attribute เป็น global ไม่ผูก
    // category เลย ไม่มี Attribute Family/option-mapping concept)
    const PLATFORMS_WITH_PRODUCT_MAPPING: MarketplacePlatform[] = ['lazada', 'shopee', 'tiktok', 'woocommerce'];
    const hasProductMappingPage = PLATFORMS_WITH_PRODUCT_MAPPING.includes(platform);

    const tiles: { key: string; icon: string; title: string; description: string; url: string; permission: string }[] = [
        ...(hasProductMappingPage
            ? [
                  {
                      key: 'products',
                      icon: 'product',
                      title: 'สินค้า (Product Mapping)',
                      description: 'ไล่การแมพข้อมูล Category & Attributes ตั้งแต่ตัวสินค้า',
                      url: `/catalog/marketplace/${platform}/products`,
                      permission: 'products.list_products',
                  },
              ]
            : []),
        // "จับคู่สินค้า (Product Matching)" — listing จริงบนร้าน ↔ สินค้าใน PIM
        // (ดู ProductMatchingController) ทุก platform ใช้หน้าเดียวกัน แค่
        // ?platform= ให้เลือกร้านแรกของ platform นี้ไว้ก่อน
        {
            key: 'productMatching',
            icon: 'chain-link',
            title: 'จับคู่สินค้า (Product Matching)',
            description: `เทียบ listing จริงบน ${platformLabel} กับสินค้าใน PIM — จับคู่แล้ว / ยังไม่จับคู่ / ยังไม่ได้ลงขาย`,
            url: `/catalog/marketplace/product-matching?platform=${platform}`,
            permission: 'products.list_products',
        },

        // ซ่อน 2 การ์ดนี้ไว้เฉพาะ platform ที่มีหน้า "สินค้า (Product Mapping)"
        // แล้ว (เคยถูก comment ออกไปแบบไม่มีเงื่อนไขมาก่อน ทำให้ทุก platform
        // ที่ไม่ใช่ Lazada เข้าหน้า category/attribute mapping จาก UI ไม่ได้
        // เลย — ดูบั๊กที่เคยแก้ไปแล้วตอน Lazada เป็น platform แรกที่มีหน้านี้
        // — ตอนนี้ครบทั้ง 4 platform แล้ว เลยไม่มี platform ไหนต้องพึ่ง 2
        // การ์ดนี้เป็นทางเข้าหลักอีกต่อไป)
        ...(!hasProductMappingPage
            ? [
                  {
                      key: 'category',
                      icon: 'tree',
                      title: tNav('mapCategory'),
                      description: t('marketplaceHubCategoryDesc'),
                      url: `/catalog/categories/${platform}-mapping`,
                      permission: 'categories.edit_categories',
                  },
              ]
            : []),
        ...(!hasProductMappingPage
            ? [
                  {
                      key: 'push',
                      icon: 'synchronize',
                      title: tNav('mapPushData'),
                      description: t('marketplaceHubPushDesc'),
                      url: `/catalog/marketplace/${platform}/attribute-mapping`,
                      permission: 'attributes.edit_attributes',
                  },
              ]
            : []),
        {
            key: 'connect',
            icon: 'settings',
            title: tNav('marketplaceConnect'),
            description: t('marketplaceHubConnectDesc'),
            url: `/catalog/marketplace/connect/${platform}`,
            permission: 'products.list_products',
        },
    ];

    const visibleTiles = tiles.filter((tile) => permissions.includes(tile.permission));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={platformLabel} />
            <div className={styles.page} style={{ padding: '2rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Title level="H4" size="H4" wrappingType="Normal" className={styles.pageTitle}>
                        {platformLabel}
                    </Title>
                    <Text className={styles.subtitle}>{t('marketplaceHubSubtitle', { platform: platformLabel })}</Text>
                </div>

                <div className={styles.tileGrid}>
                    {visibleTiles.map((tile) => (
                        <div
                            key={tile.key}
                            role="link"
                            tabIndex={0}
                            onClick={() => router.visit(tile.url)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') router.visit(tile.url);
                            }}
                            className={`${styles.card} ${styles.tile}`}
                        >
                            <div style={{ padding: '1.5rem' }}>
                                <div
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 48,
                                        height: 48,
                                        borderRadius: '8px',
                                        background: 'var(--sapBrandColor)',
                                        marginBottom: '1rem',
                                    }}
                                >
                                    <Icon name={tile.icon} style={{ width: 26, height: 26, color: 'var(--sapContent_ContrastIconColor, #fff)' }} />
                                </div>
                                <Title level="H5" size="H5" wrappingType="Normal" style={{ display: 'block' }}>
                                    {tile.title}
                                </Title>
                                <Text style={{ display: 'block', color: 'var(--sapContent_LabelColor)', marginTop: '0.25rem' }}>
                                    {tile.description}
                                </Text>
                            </div>
                        </div>
                    ))}

                    {visibleTiles.length === 0 && <Text style={{ color: 'var(--sapContent_LabelColor)' }}>{t('managementNoAccess')}</Text>}
                </div>
            </div>
        </AppLayout>
    );
}
