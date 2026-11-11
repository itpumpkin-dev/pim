import { ShopeeAttributeMappingPanel, type ShopeeAttributeMappingPanelProps } from '@/components/catalog/shopee-attribute-mapping-panel';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Text, Title } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

type Props = ShopeeAttributeMappingPanelProps;

/**
 * "แมปฟิวส่งข้อมูล" ของ Shopee — ดู docblock ของ
 * catalog/marketplace/woocommerce-attribute-mapping.tsx (แยกออกมาจากหน้า Tabs
 * รวมเดิมแบบเดียวกัน แค่คนละแพลตฟอร์ม)
 */
export default function ShopeeAttributeMapping({ attributes, shopeeAttributes, coverage }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '/catalog/marketplace' },
        { title: 'Shopee', href: '/catalog/marketplace/product-master?platform=shopee' },
        { title: tNav('mapPushData'), href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('marketplaceAttributeMapping')} — Shopee`} />
            <div style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <Title level="H4" size="H4" wrappingType="Normal">
                    {t('marketplaceAttributeMapping')} — Shopee
                </Title>
                <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)', margin: '0.5rem 0' }} />
                <Text style={{ display: 'block', color: 'var(--sapContent_LabelColor)', maxWidth: 840, marginBottom: '1.5rem' }}>
                    {t('marketplaceAttributeMappingHelp')}
                </Text>

                <ShopeeAttributeMappingPanel attributes={attributes} shopeeAttributes={shopeeAttributes} coverage={coverage} />
            </div>
        </AppLayout>
    );
}
