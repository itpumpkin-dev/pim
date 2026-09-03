import { WooCommerceAttributeMappingPanel, type WooCommerceAttributeMappingPanelProps } from '@/components/catalog/woocommerce-attribute-mapping-panel';
import AppLayout from '@/layouts/app-layout';
import { FIORI } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Box, Divider, Typography } from '@mui/material';
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
        { title: tNav('marketplace'), href: '#' },
        { title: 'WooCommerce', href: '/catalog/marketplace/woocommerce' },
        { title: tNav('mapPushData'), href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('marketplaceAttributeMapping')} — WooCommerce`} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                    {t('marketplaceAttributeMapping')} — WooCommerce
                </Typography>
                <Divider sx={{ my: 1, borderColor: FIORI.border }} />
                <Typography variant="body2" sx={{ color: FIORI.textSecondary, maxWidth: 840, mb: 3 }}>
                    {t('marketplaceAttributeMappingHelp')}
                </Typography>

                <WooCommerceAttributeMappingPanel attributes={attributes} wooCommerceAttributes={wooCommerceAttributes} coverage={coverage} />
            </Box>
        </AppLayout>
    );
}
