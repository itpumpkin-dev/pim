import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/connected.js';
import '@ui5/webcomponents-icons/dist/product.js';
import { Avatar, Card, CardHeader, Text, Title } from '@ui5/webcomponents-react';

import styles from './marketplace.module.css';

const PLATFORMS = [
    { key: 'shopee', label: 'Shopee' },
    { key: 'lazada', label: 'Lazada' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'woocommerce', label: 'WooCommerce' },
] as const;

/**
 * มาสเตอร์ > มาร์เก็ตเพลส — หน้ารวมของเมนูเดียว (เดิมแยกเป็นเมนูต่อ platform) มีการ์ด
 * "Marketplace Product Master" ใบเดียว พาไปตารางสินค้าทุก platform ซึ่งมีปุ่มไปหน้า
 * จับคู่สินค้า (Product Matching) และสินค้า (Product Mapping) ต่ออีกที — และการ์ด "ตั้งค่าการเชื่อมต่อ"
 * พาไปหน้าตั้งค่าร้านหน้าเดียว (กรอง platform ข้างใน — โชว์การ์ดเมื่อมีสิทธิ์
 * marketplace_{platform}.list_marketplace_{platform} อย่างน้อยหนึ่ง platform เหมือนที่ controller เช็ค)
 */
export default function MarketplaceHub() {
    const permissions = usePage<SharedData>().props.auth.permissions || [];
    const connectPlatforms = PLATFORMS.filter((p) => permissions.includes(`marketplace_${p.key}.list_marketplace_${p.key}`));
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Catalog', href: '#' },
        { title: 'Master', href: '#' },
        { title: 'Marketplace', href: '/catalog/marketplace' },
    ];
    const url = '/catalog/marketplace/product-master';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="มาร์เก็ตเพลส" />
            <div className={styles.page} style={{ padding: '2rem' }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Title level="H4" size="H4" wrappingType="Normal" className={styles.pageTitle}>
                        มาร์เก็ตเพลส
                    </Title>
                    <Text className={styles.subtitle}>ข้อมูลสินค้าที่ดึงมาจาก Shopee, Lazada, TikTok และ WooCommerce</Text>
                </div>

                <div className={styles.tileGrid}>
                    <Card
                        className={styles.hubCard}
                        header={
                            <CardHeader
                                interactive
                                onClick={() => router.visit(url)}
                                titleText="Marketplace Product Master"
                                subtitleText="Shopee · Lazada · TikTok · WooCommerce"
                                avatar={<Avatar icon="product" shape="Square" size="S" colorScheme="Accent6" />}
                            />
                        }
                    >
                        <div className={styles.hubCardContent}>
                            <Text className={styles.muted}>
                                ตารางสินค้าทั้งหมดที่ดึงมาจากทุกร้าน แยกตาม platform — ราคา สต็อก สถานะ แบรนด์ หมวดหมู่ และสินค้าใน PIM ที่จับคู่ไว้
                            </Text>
                        </div>
                    </Card>

                    {/* ตั้งค่าการเชื่อมต่อ — หน้าเดียวทุก platform (กรอง platform ข้างใน) */}
                    {connectPlatforms.length > 0 && (
                        <Card
                            className={styles.hubCard}
                            header={
                                <CardHeader
                                    interactive
                                    onClick={() => router.visit('/catalog/marketplace/connect')}
                                    titleText="ตั้งค่าการเชื่อมต่อ"
                                    subtitleText={connectPlatforms.map((p) => p.label).join(' · ')}
                                    avatar={<Avatar icon="connected" shape="Square" size="S" colorScheme="Accent6" />}
                                />
                            }
                        >
                            <div className={styles.hubCardContent}>
                                <Text className={styles.muted}>จัดการร้านค้าและการเชื่อมต่อบัญชีผู้ขายของแต่ละ platform</Text>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
