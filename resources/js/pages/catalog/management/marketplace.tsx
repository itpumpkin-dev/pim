import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { Box, Grid, Typography } from '@mui/material';
import { type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriCardSx } from '@/lib/fiori-style';

/**
 * "จัดการ Ecommerce/Marketplace" — sits between the Management hub and the
 * two real sync pages (categories/marketplace-sync, brands/marketplace-sync),
 * which used to be separate tiles on that hub. Purely a launcher like the
 * hub itself: each card just navigates to the existing page, which still
 * owns all of its own sync/mapping actions and permission checks.
 */
export default function CatalogManagementMarketplace() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '#' },
    ];

    const tiles: { key: string; icon: ComponentType<{ sx?: object }>; title: string; description: string; url: string; permission: string }[] = [
        {
            key: 'categories',
            icon: CategoryOutlinedIcon,
            title: t('manageCategoriesCard'),
            description: t('marketplaceSyncSubtitle'),
            url: '/catalog/categories/marketplace-sync',
            permission: 'categories.list_categories',
        },
        {
            key: 'brands',
            icon: StorefrontOutlinedIcon,
            title: t('manageBrandsCard'),
            description: t('brandMarketplaceSyncSubtitle'),
            url: '/catalog/brands/marketplace-sync',
            permission: 'brands.list_brands',
        },
        {
            key: 'marketplaceAttributeMapping',
            icon: AccountTreeOutlinedIcon,
            title: t('marketplaceAttributeMapping'),
            description: t('marketplaceAttributeMappingCardDescription'),
            url: '/catalog/attributes/marketplace-mapping',
            permission: 'attributes.edit_attributes',
        },
    ];

    const visibleTiles = tiles.filter((tile) => permissions.includes(tile.permission));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('manageEcommerceMarketplaceTab')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('manageEcommerceMarketplaceTab')}</Typography>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{t('manageEcommerceMarketplaceSubtitle')}</Typography>
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
