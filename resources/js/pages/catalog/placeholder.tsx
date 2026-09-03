import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import { Box, Paper, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { FIORI, fioriCardSx } from '@/lib/fiori-style';

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
    // resources/js/pages/catalog/marketplace/platform-hub.tsx ที่การ์ด
    // "ตั้งค่าการเชื่อมต่อ" พามาที่นี่) — stub อื่น (เช่น "bom") อยู่ตรงใต้
    // Catalog เฉยๆ ไม่มีชั้นพ่อแม่ให้ต้องใส่ ใช้ subtitle (ชื่อแพลตฟอร์มที่ route
    // นี้ส่งมาอยู่แล้ว) หาทางกลับไปหน้า hub ของแพลตฟอร์มนั้นด้วยเลย
    const isMarketplaceConnect = titleKey === 'marketplaceConnect' && subtitle;
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        ...(isMarketplaceConnect
            ? [
                  { title: tNav('master'), href: '#' },
                  { title: tNav('marketplace'), href: '#' },
                  { title: subtitle, href: `/catalog/marketplace/${subtitle.toLowerCase()}` },
              ]
            : []),
        { title, href: '#' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={title} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{title}</Typography>
                    {subtitle && (
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{subtitle}</Typography>
                    )}
                </Box>

                <Paper sx={{ ...fioriCardSx, p: { xs: 4, md: 6 }, textAlign: 'center', maxWidth: 560 }}>
                    <Box
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 56,
                            height: 56,
                            borderRadius: '12px',
                            bgcolor: FIORI.brandBg,
                            color: FIORI.brand,
                            mb: 2,
                        }}
                    >
                        <ConstructionOutlinedIcon sx={{ fontSize: 30 }} />
                    </Box>
                    <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary, mb: 0.5 }}>
                        {t('placeholderTitle')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                        {t('placeholderBody')}
                    </Typography>
                </Paper>
            </Box>
        </AppLayout>
    );
}
