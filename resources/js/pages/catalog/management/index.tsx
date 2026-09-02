import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import TranslateIcon from '@mui/icons-material/Translate';
import { Box, Grid, Typography } from '@mui/material';
import { type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriCardSx } from '@/lib/fiori-style';

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

    const tiles: { key: string; icon: ComponentType<{ sx?: object }>; title: string; description: string; url: string; permission: string | string[] }[] = [
        {
            key: 'missing-translations',
            icon: TranslateIcon,
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
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('managementTitle')}</Typography>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{t('managementSubtitle')}</Typography>
                </Box>

                <Grid container spacing={3}>
                    {visibleTiles.map((tile) => {
                        const Icon = tile.icon;

                        return (
                            <Grid item xs={12} sm={6} md={4} key={tile.key}>
                                <Box
                                    onClick={() => router.visit(tile.url)}
                                    sx={{
                                        ...fioriCardSx,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        height: '100%',
                                        cursor: 'pointer',
                                        transition: 'border-color 0.15s ease',
                                        '&:hover': { borderColor: FIORI.brand },
                                    }}
                                >
                                    <Box sx={{ p: 3 }}>
                                        <Box
                                            sx={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: 48,
                                                height: 48,
                                                borderRadius: '8px',
                                                bgcolor: FIORI.brand,
                                                mb: 2,
                                            }}
                                        >
                                            <Icon sx={{ fontSize: 26, color: '#fff' }} />
                                        </Box>
                                        <Typography variant="h6" fontWeight={700} sx={{ color: FIORI.textPrimary }}>{tile.title}</Typography>
                                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.5 }}>
                                            {tile.description}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        );
                    })}

                    {visibleTiles.length === 0 && (
                        <Grid item xs={12}>
                            <Typography sx={{ color: FIORI.textSecondary }}>{t('managementNoAccess')}</Typography>
                        </Grid>
                    )}
                </Grid>
            </Box>
        </AppLayout>
    );
}
