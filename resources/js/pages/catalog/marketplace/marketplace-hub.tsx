import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/settings.js';
import { Icon, Link, Text, Title } from '@ui5/webcomponents-react';
import type { CSSProperties } from 'react';

import styles from './marketplace.module.css';

const PLATFORMS = [
    { key: 'shopee', label: 'Shopee' },
    { key: 'lazada', label: 'Lazada' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'woocommerce', label: 'WooCommerce' },
] as const;

const iconBox: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: '8px',
    background: 'var(--sapBrandColor)',
    marginBottom: '1rem',
};
const iconStyle: CSSProperties = { width: 26, height: 26, color: 'var(--sapContent_ContrastIconColor, #fff)' };

/**
 * มาสเตอร์ > มาร์เก็ตเพลส — หน้ารวมของเมนูเดียว (เดิมแยกเป็นเมนูต่อ platform) มีการ์ด
 * "Marketplace Product Master" ใบเดียว พาไปตารางสินค้าทุก platform ซึ่งมีปุ่มไปหน้า
 * จับคู่สินค้า (Product Matching) และสินค้า (Product Mapping) ต่ออีกที — และการ์ด "ตั้งค่าการเชื่อมต่อ"
 * ที่มีลิงก์ไปหน้าตั้งค่าร้านของแต่ละ platform (โชว์เฉพาะ platform ที่มีสิทธิ์
 * marketplace_{platform}.list_marketplace_{platform} เหมือน route ปลายทาง)
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
                    <div
                        role="link"
                        tabIndex={0}
                        onClick={() => router.visit(url)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') router.visit(url);
                        }}
                        className={`${styles.card} ${styles.tile}`}
                    >
                        <div style={{ padding: '1.5rem' }}>
                            <div style={iconBox}>
                                <Icon name="product" style={iconStyle} />
                            </div>
                            <Title level="H5" size="H5" wrappingType="Normal" style={{ display: 'block' }}>
                                Marketplace Product Master
                            </Title>
                            <Text style={{ display: 'block', color: 'var(--sapContent_LabelColor)', marginTop: '0.25rem' }}>
                                ตารางสินค้าทั้งหมดที่ดึงมาจากทุกร้าน แยกตาม platform — ราคา สต็อก สถานะ แบรนด์ หมวดหมู่ และสินค้าใน PIM ที่จับคู่ไว้
                            </Text>
                        </div>
                    </div>

                    {/* ตั้งค่าการเชื่อมต่อ — การ์ดนี้ไม่ใช่ลิงก์ทั้งใบ (ตั้งค่าแยกต่อ platform) คลิกชื่อ platform ด้านใน */}
                    {connectPlatforms.length > 0 && (
                        <div className={styles.card}>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={iconBox}>
                                    <Icon name="settings" style={iconStyle} />
                                </div>
                                <Title level="H5" size="H5" wrappingType="Normal" style={{ display: 'block' }}>
                                    ตั้งค่าการเชื่อมต่อ
                                </Title>
                                <Text style={{ display: 'block', color: 'var(--sapContent_LabelColor)', marginTop: '0.25rem' }}>
                                    จัดการร้านค้าและการเชื่อมต่อบัญชีผู้ขายของแต่ละ platform
                                </Text>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1rem', marginTop: '0.75rem' }}>
                                    {connectPlatforms.map((p) => (
                                        <Link key={p.key} onClick={() => router.visit(`/catalog/marketplace/connect/${p.key}`)}>
                                            {p.label}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
