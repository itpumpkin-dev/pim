import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/translate.js';
import { Avatar, Card, CardHeader, Text } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, masterStyles } from '../master-crud';

/**
 * หน้า hub "จัดการ" — เป็นเมนู sidebar จุดเดียวที่รวมหน้าย่อยที่แต่ก่อนจะซ่อนอยู่ลึก
 * ในแต่ละ entity ของตัวเอง (list คำแปลที่ขาดของ Products) เลยย้ายมาไว้ตรงนี้ให้กด
 * คลิกเดียวถึงจาก sidebar ของ Catalog เลย แต่ละการ์ดแค่พาไปหน้าจริงเท่านั้น —
 * การเช็ค permission และ action ต่างๆ ยังอยู่ที่หน้าปลายทางเหมือนเดิม หน้านี้เป็น
 * แค่ตัวพาไป (launcher) เลยไม่ต้องมี props จาก server เลย
 *
 * ไม่มีการ์ด "จัดการ Ecommerce/Marketplace" แล้ว — ทุก action ของ Marketplace
 * (sync/mapping หมวดหมู่+แบรนด์, จับคู่แอตทริบิวต์, export/import CSV ของ
 * WooCommerce) ย้ายไปอยู่ใต้มาสเตอร์ > มาร์เก็ตเพลส > แต่ละแพลตฟอร์มหมดแล้ว —
 * หน้า management/marketplace.tsx ที่การ์ดนี้เคยพาไป (แค่ launcher มีการ์ดเดียว
 * เหลืออยู่) เลยไม่มีที่ให้ลิงก์เข้าถึงอีกต่อไป เลยลบทั้งไฟล์/route ทิ้งไปด้วยกัน
 */
export default function CatalogManagement() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '#' },
    ];

    const tiles: { key: string; icon: string; title: string; description: string; url: string; permission: string | string[] }[] = [
        {
            key: 'missing-translations',
            icon: 'translate',
            title: tNav('missingTranslations'),
            description: t('manageMissingTranslationsDesc'),
            url: '/catalog/product-translations',
            permission: 'product_translations.list_product_translations',
        },
    ];

    const visibleTiles = tiles.filter((tile) =>
        Array.isArray(tile.permission) ? tile.permission.some((p) => permissions.includes(p)) : permissions.includes(tile.permission),
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('management')} />
            <MasterListPage title={t('managementTitle')} intro={t('managementSubtitle')}>
                <div className={masterStyles.tileGrid}>
                    {visibleTiles.map((tile) => (
                        <Card
                            key={tile.key}
                            className={masterStyles.tileCard}
                            header={
                                <CardHeader
                                    interactive
                                    onClick={() => router.visit(tile.url)}
                                    titleText={tile.title}
                                    avatar={<Avatar icon={tile.icon} shape="Square" size="S" colorScheme="Accent6" />}
                                />
                            }
                        >
                            <div className={masterStyles.tileCardContent}>
                                <Text className={masterStyles.muted}>{tile.description}</Text>
                            </div>
                        </Card>
                    ))}

                    {visibleTiles.length === 0 && <span className={masterStyles.muted}>{t('managementNoAccess')}</span>}
                </div>
            </MasterListPage>
        </AppLayout>
    );
}
