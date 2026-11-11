import { LazadaAttributeMappingPanel, type LazadaAttributeMappingPanelProps } from '@/components/catalog/lazada-attribute-mapping-panel';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Text, Title } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

type Props = LazadaAttributeMappingPanelProps;

/**
 * "แมปฟิวส่งข้อมูล" ของ Lazada — ดู docblock ของ
 * catalog/marketplace/woocommerce-attribute-mapping.tsx (แยกออกมาจากหน้า Tabs
 * รวมเดิมแบบเดียวกัน แค่คนละแพลตฟอร์ม)
 */
export default function LazadaAttributeMapping({ attributes, lazadaAttributes, coverage }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '/catalog/marketplace' },
        { title: 'Lazada', href: '/catalog/marketplace/product-master?platform=lazada' },
        { title: tNav('mapPushData'), href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('marketplaceAttributeMapping')} — Lazada`} />
            <div style={{ padding: '2rem', background: 'var(--sapBackgroundColor)', minHeight: '100%', boxSizing: 'border-box' }}>
                <Title level="H4" size="H4" wrappingType="Normal">
                    {t('marketplaceAttributeMapping')} — Lazada
                </Title>
                <div style={{ borderTop: '1px solid var(--sapGroup_ContentBorderColor)', margin: '0.5rem 0' }} />
                <Text style={{ display: 'block', color: 'var(--sapContent_LabelColor)', maxWidth: 840, marginBottom: '1.5rem' }}>
                    {t('marketplaceAttributeMappingHelp')}
                </Text>

                <LazadaAttributeMappingPanel attributes={attributes} lazadaAttributes={lazadaAttributes} coverage={coverage} />
            </div>
        </AppLayout>
    );
}
