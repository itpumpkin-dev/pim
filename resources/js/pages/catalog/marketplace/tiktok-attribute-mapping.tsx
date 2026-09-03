import { TikTokAttributeMappingPanel, type TikTokAttributeMappingPanelProps } from '@/components/catalog/tiktok-attribute-mapping-panel';
import AppLayout from '@/layouts/app-layout';
import { FIORI } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Box, Divider, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

type Props = TikTokAttributeMappingPanelProps;

/**
 * "แมปฟิวส่งข้อมูล" ของ TikTok — ดู docblock ของ
 * catalog/marketplace/woocommerce-attribute-mapping.tsx (แยกออกมาจากหน้า Tabs
 * รวมเดิมแบบเดียวกัน แค่คนละแพลตฟอร์ม)
 */
export default function TikTokAttributeMapping({ attributes, tiktokAttributes, coverage }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: 'TikTok', href: '/catalog/marketplace/tiktok' },
        { title: tNav('mapPushData'), href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('marketplaceAttributeMapping')} — TikTok`} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                    {t('marketplaceAttributeMapping')} — TikTok
                </Typography>
                <Divider sx={{ my: 1, borderColor: FIORI.border }} />
                <Typography variant="body2" sx={{ color: FIORI.textSecondary, maxWidth: 840, mb: 3 }}>
                    {t('marketplaceAttributeMappingHelp')}
                </Typography>

                <TikTokAttributeMappingPanel attributes={attributes} tiktokAttributes={tiktokAttributes} coverage={coverage} />
            </Box>
        </AppLayout>
    );
}
