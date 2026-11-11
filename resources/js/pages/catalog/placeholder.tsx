import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/wrench.js';
import { Icon, Text, Title } from '@ui5/webcomponents-react';
import { useTranslation } from 'react-i18next';

import { MasterListPage, masterStyles } from './master-crud';

interface Props {
    /** i18n key in the `nav` namespace for this page's title. */
    titleKey: string;
    /** Optional extra line under the title (e.g. a platform name) — shown as-is. */
    subtitle?: string | null;
}

/**
 * Generic "under construction" page for Catalog master-data screens that have
 * a sidebar entry and a route reserved but no real implementation yet. Each
 * such route just renders this with its own `titleKey`; when the feature is
 * built for real, point the route at its own controller/page instead.
 */
export default function CatalogPlaceholder({ titleKey, subtitle = null }: Props) {
    const { t: tNav } = useTranslation('nav');
    const { t } = useTranslation('catalog');

    const title = tNav(titleKey);

    // "ตั้งค่าการเชื่อมต่อ" (marketplaceConnect) เป็น stub เดียวที่อยู่ลึกเข้าไป
    // ใต้ มาสเตอร์ > มาร์เก็ตเพลส > {แพลตฟอร์ม} จริงๆ (ดู
    // การ์ด "ตั้งค่าการเชื่อมต่อ" ของหน้า มาร์เก็ตเพลส) — stub อื่น (เช่น "bom") อยู่ตรงใต้
    // Catalog เฉยๆ ไม่มีชั้นพ่อแม่ให้ต้องใส่ ใช้ subtitle (ชื่อแพลตฟอร์มที่ route
    // นี้ส่งมาอยู่แล้ว) หาทางกลับไปหน้า hub ของแพลตฟอร์มนั้นด้วยเลย
    const isMarketplaceConnect = titleKey === 'marketplaceConnect' && subtitle;
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        ...(isMarketplaceConnect
            ? [
                  { title: tNav('master'), href: '#' },
                  { title: tNav('marketplace'), href: '/catalog/marketplace' },
                  { title: subtitle, href: `/catalog/marketplace/product-master?platform=${subtitle.toLowerCase()}` },
              ]
            : []),
        { title, href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={title} />
            <MasterListPage title={title} intro={subtitle ?? undefined}>
                <div className={masterStyles.emptyPanel}>
                    <span className={masterStyles.emptyPanelIcon}>
                        <Icon name="wrench" />
                    </span>
                    <Title level="H3" size="H5" wrappingType="Normal" style={{ marginBottom: '0.25rem' }}>
                        {t('placeholderTitle')}
                    </Title>
                    <Text className={masterStyles.muted}>{t('placeholderBody')}</Text>
                </div>
            </MasterListPage>
        </AppLayout>
    );
}
