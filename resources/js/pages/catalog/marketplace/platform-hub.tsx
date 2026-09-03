import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import CategoryIcon from '@mui/icons-material/Category';
import SettingsIcon from '@mui/icons-material/Settings';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import { Box, Grid, Typography } from '@mui/material';
import { type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriCardSx } from '@/lib/fiori-style';

type MarketplacePlatform = 'shopee' | 'lazada' | 'tiktok' | 'woocommerce';

const PLATFORM_LABEL: Record<MarketplacePlatform, string> = {
    shopee: 'Shopee',
    lazada: 'Lazada',
    tiktok: 'TikTok',
    woocommerce: 'WooCommerce',
};

interface Props {
    platform: MarketplacePlatform;
}

/**
 * หน้า hub ของแต่ละแพลตฟอร์มใต้ มาสเตอร์ > มาร์เก็ตเพลส — แทนที่เมนู sidebar
 * แบบซ้อน 2 ชั้นเดิม (มาร์เก็ตเพลส > การเชื่อมต่อ [4 แพลตฟอร์ม] + มาร์เก็ตเพลส
 * > {แพลตฟอร์ม} > [จับคู่หมวดหมู่, จับคู่ข้อมูลส่ง]) ด้วยเมนูแบนราบ (มาร์เก็ตเพลส
 * > Shopee/Lazada/TikTok/WooCommerce ตรงๆ) ที่แต่ละอันพามาหน้านี้แทน — ให้เห็น
 * ทั้ง 3 การ์ดของแพลตฟอร์มนั้นพร้อมกันในที่เดียว (จับคู่หมวดหมู่, จับคู่ข้อมูลส่ง,
 * ตั้งค่าการเชื่อมต่อ) เหมือนกับ catalog/management (หน้า "จัดการ") ทุกประการ —
 * เป็นแค่ launcher การ์ดพาไปหน้าจริง ไม่มี business logic ของตัวเอง สิทธิ์การ
 * เข้าถึงยังเช็คที่หน้าปลายทางเหมือนเดิม การ์ดจะซ่อนไปเองถ้า user ไม่มีสิทธิ์นั้น
 * (เหมือนกับที่เมนู sidebar เดิมซ่อนอยู่ก่อนหน้านี้)
 *
 * `platform` มาจาก route param เดียวกับที่ marketplace/connect/{platform} เดิม
 * ใช้อยู่แล้ว (ดู routes/catalog.php) — จำกัดแค่ 4 ค่านี้ด้วย whereIn ที่ route
 */
export default function MarketplacePlatformHub({ platform }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];

    const platformLabel = PLATFORM_LABEL[platform] ?? platform;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: platformLabel, href: '#' },
    ];

    const tiles: { key: string; icon: ComponentType<{ sx?: object }>; title: string; description: string; url: string; permission: string }[] = [
        {
            key: 'category',
            icon: CategoryIcon,
            title: tNav('mapCategory'),
            description: t('marketplaceHubCategoryDesc'),
            url: `/catalog/categories/${platform}-mapping`,
            permission: 'categories.edit_categories',
        },
        {
            key: 'push',
            icon: SyncAltIcon,
            title: tNav('mapPushData'),
            description: t('marketplaceHubPushDesc'),
            url: `/catalog/marketplace/${platform}/attribute-mapping`,
            permission: 'attributes.edit_attributes',
        },
        {
            key: 'connect',
            icon: SettingsIcon,
            title: tNav('marketplaceConnect'),
            description: t('marketplaceHubConnectDesc'),
            url: `/catalog/marketplace/connect/${platform}`,
            permission: 'products.list_products',
        },
    ];

    const visibleTiles = tiles.filter((tile) => permissions.includes(tile.permission));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={platformLabel} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{platformLabel}</Typography>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                        {t('marketplaceHubSubtitle', { platform: platformLabel })}
                    </Typography>
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
