import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import DownloadIcon from '@mui/icons-material/Download';
import LinkIcon from '@mui/icons-material/Link';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { Box, Button, Card, CardContent, CircularProgress, Divider, Grid, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { solidActionSx, syncDetailCardSx, syncPlatformCardSx } from '@/lib/ui-style';

// One button + platform picker instead of one dedicated button per platform
// (which doesn't scale — was literally "Sync Lazada Categories" hardcoded).
// Adding another platform's category sync is just one more entry here plus
// its own backend route.
const CATEGORY_SYNC_PLATFORMS = [
    { value: 'lazada', label: 'Lazada', route: '/catalog/categories/sync-lazada', mappingRoute: '/catalog/categories/lazada-mapping', exportRoute: null, importRoute: null },
    { value: 'shopee', label: 'Shopee', route: '/catalog/categories/sync-shopee', mappingRoute: '/catalog/categories/shopee-mapping', exportRoute: null, importRoute: null },
    { value: 'tiktok', label: 'TikTok', route: '/catalog/categories/sync-tiktok', mappingRoute: '/catalog/categories/tiktok-mapping', exportRoute: null, importRoute: null },
    {
        value: 'woocommerce',
        label: 'WooCommerce',
        route: '/catalog/categories/sync-woocommerce',
        mappingRoute: '/catalog/categories/woocommerce-mapping',
        exportRoute: '/catalog/categories/export-woocommerce',
        importRoute: '/catalog/categories/import-woocommerce',
    },
] as const;

function formatLocalDateTime(value: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok' });
}

interface Props {
    lastSyncedAt: Record<string, string | null>;
}

export default function CategoryMarketplaceSync({ lastSyncedAt }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    // Every action on this page (sync/map/export/import) is backed by a
    // route that requires categories.edit_categories — there's no
    // separate create/delete split here, unlike the CRUD list pages, so
    // one check gates the whole action panel.
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('categories.edit_categories');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '/catalog/management/marketplace' },
        { title: t('marketplaceSyncTitle'), href: '#' },
    ];

    const [syncing, setSyncing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [syncPlatform, setSyncPlatform] = useState<string>(CATEGORY_SYNC_PLATFORMS[0].value);

    const selected = CATEGORY_SYNC_PLATFORMS.find((p) => p.value === syncPlatform) ?? CATEGORY_SYNC_PLATFORMS[0];

    const runSync = () => {
        setSyncing(true);
        router.post(selected.route, {}, { onFinish: () => setSyncing(false) });
    };

    const runImport = () => {
        if (!selected.importRoute) return;
        setImporting(true);
        router.post(selected.importRoute, {}, { onFinish: () => setImporting(false) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('marketplaceSyncTitle')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('marketplaceSyncTitle')}</Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography color="text.secondary">{t('marketplaceSyncSubtitle')}</Typography>
                </Box>

                {/* Platform picker — same info-box language as dashboard.tsx's Row 2 /
                    salesPlatforms/index.tsx's summary strip, doubling as the platform
                    selector for the panel below (click a tile instead of a <Select>). */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                    {CATEGORY_SYNC_PLATFORMS.map((platform) => {
                        const isSelected = platform.value === syncPlatform;

                        return (
                            <Grid item xs={12} sm={6} md={3} key={platform.value} sx={{ display: 'flex' }}>
                                <Box
                                    onClick={() => {
                                        if (syncing) return;
                                        setSyncPlatform(platform.value);
                                    }}
                                    sx={syncPlatformCardSx(isSelected, syncing)}
                                >
                                    {/* <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: 70,
                                            bgcolor: 'grey.200',
                                            flexShrink: 0,
                                            borderRight: `1px solid ${WIREFRAME_BORDER}`,
                                        }}
                                    >
                                        <StorefrontOutlinedIcon sx={{ fontSize: 28, color: 'grey.600' }} />
                                    </Box> */}
                                    <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <Typography variant="body2" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontSize: '1rem', fontWeight: 600 }}>
                                            {platform.label}
                                        </Typography>
                                        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '0.8rem', color: 'text.primary', mt: 0.25 }}>
                                            {t('lastSyncedAt', { datetime: formatLocalDateTime(lastSyncedAt[platform.value] ?? null) })}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        );
                    })}
                </Grid>

                <Card elevation={0} sx={syncDetailCardSx('strong')}>
                    <CardContent sx={{ p: 3 }}>
                        <Stack spacing={2.5}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Typography variant="h6" fontWeight={700}>{selected.label}</Typography>
                            </Stack>

                            {canEdit && (
                                <Stack direction="column" spacing={1.5} flexWrap="wrap" useFlexGap>
                                     <Button
                                        variant="contained"
                                        sx={solidActionSx}
                                        startIcon={<LinkIcon />}
                                        onClick={() => router.visit(selected.mappingRoute)}
                                    >
                                        {t('mapToPlatformCategories', { platform: selected.label })}
                                    </Button>
                                    {/* Shopee's own "Sync Categories" button now lives on
                                        categories/shopee-mapping.tsx itself (see that page's
                                        docblock) — its category tree tends to need re-syncing
                                        right before a mapping session, not from this hub. */}
                                    {selected.value !== 'shopee' && (
                                        <Button
                                            variant="outlined"
                                            startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                                            disabled={syncing}
                                            onClick={runSync}
                                        >
                                            {syncing ? t('syncingLazada') : t('syncCategories')}
                                        </Button>
                                    )}
                                    {selected.exportRoute && (
                                        <Button
                                            variant="outlined"
                                            startIcon={<DownloadIcon />}
                                            component="a"
                                            href={selected.exportRoute}
                                        >
                                            {t('exportCategoriesCsv')}
                                        </Button>
                                    )}
                                    {selected.importRoute && (
                                        <Button
                                            variant="outlined"
                                            startIcon={importing ? <CircularProgress size={16} /> : <SystemUpdateAltIcon />}
                                            disabled={importing}
                                            onClick={runImport}
                                        >
                                            {importing ? t('importingCategories') : t('importAsPimCategories')}
                                        </Button>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    </CardContent>
                </Card>
            </Box>
        </AppLayout>
    );
}
