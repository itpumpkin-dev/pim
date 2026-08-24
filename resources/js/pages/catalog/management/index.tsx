import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import TranslateIcon from '@mui/icons-material/Translate';
import { Box, Grid, Typography } from '@mui/material';
import { type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriCardSx } from '@/lib/fiori-style';

/**
 * "จัดการ" hub — a single sidebar entry consolidating three pages that
 * previously only lived one level down inside their own entities
 * (Products' missing-translations list, and the Categories/Brands
 * marketplace-sync tabs) so they're reachable in one click from Catalog's
 * sidebar instead. Each card just navigates to the real page — all
 * permission checks and actions still live there, this is purely a
 * launcher, so it needs no server-side props of its own.
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
        {
            // Combines what used to be two separate tiles ("ซิงค์
            // Marketplace" for Categories, "จัดการ Ecommerce" for Brands)
            // into one entry point — visible to anyone who can reach either
            // destination, since the page it links to (management/marketplace)
            // shows only the cards the viewer actually has permission for.
            key: 'ecommerce-marketplace',
            icon: StorefrontOutlinedIcon,
            title: t('manageEcommerceMarketplaceTab'),
            description: t('manageEcommerceMarketplaceSubtitle'),
            url: '/catalog/management/marketplace',
            permission: ['categories.list_categories', 'brands.list_brands'],
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
