import {
    WooCommerceAttributeMappingPanel,
    type WooCommerceAttributeMappingPanelProps,
} from '@/components/catalog/woocommerce-attribute-mapping-panel';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Text, Title } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

type Props = WooCommerceAttributeMappingPanelProps;

/**
 * "แมปฟิวส่งข้อมูล" ของ WooCommerce — เดิมเป็นแท็บ "WooCommerce" หนึ่งในสี่บน
 * catalog/attributes/marketplace-mapping.tsx (หน้าเดียวรวมทั้ง 4 แพลตฟอร์ม สลับ
 * ด้วย Tabs) ตอนนี้แยกเป็นหน้า/URL ของตัวเองจริงๆ แล้วตามที่ user ขอ — UI การ
 * mapping จริงๆ ยังอยู่ใน WooCommerceAttributeMappingPanel เหมือนเดิมทุกอย่าง
 * (endpoint save/sync ก็เหมือนเดิม ไม่มีการแก้ backend ฝั่งเขียนข้อมูลเลย มีแค่
 * MarketplaceAttributeMappingController::woocommerce() ที่ตัดมาจาก index() เดิม
 * ให้ส่ง prop เฉพาะของแพลตฟอร์มนี้ตัวเดียว)
 */
export default function WoocommerceAttributeMapping({ attributes, wooCommerceAttributes, coverage }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '/catalog/marketplace' },
        { title: 'WooCommerce', href: '/catalog/marketplace/product-master?platform=woocommerce' },
        { title: tNav('mapPushData'), href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('marketplaceAttributeMapping')} — WooCommerce`} />
            <div style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <Title level="H4" size="H4" wrappingType="Normal">
                    {t('marketplaceAttributeMapping')} — WooCommerce
                </Title>
                <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)', margin: '0.5rem 0' }} />
                <Text style={{ display: 'block', color: 'var(--sapContent_LabelColor)', maxWidth: 840, marginBottom: '1.5rem' }}>
                    {t('marketplaceAttributeMappingHelp')}
                </Text>

                <WooCommerceAttributeMappingPanel attributes={attributes} wooCommerceAttributes={wooCommerceAttributes} coverage={coverage} />
            </div>
        </AppLayout>
    );
}
