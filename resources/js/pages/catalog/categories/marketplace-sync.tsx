import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import DownloadIcon from '@mui/icons-material/Download';
import LinkIcon from '@mui/icons-material/Link';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { FIORI, FioriStatus, fioriDefaultSx, type FioriTone } from '@/lib/fiori-style';

// One row per platform instead of a picker-tile + single detail panel (the
// old design only ever showed one platform's actions at a time) — every
// platform's available actions are visible at once now, so adding another
// platform is still just one more entry here plus its own backend route.
//
// Category AND brand sync/mapping both live on each platform's own
// categories/{platform}-mapping.tsx page now (Shopee and Lazada first,
// TikTok and WooCommerce brought in line the same way — see each page's
// docblock) — reviewing a category tree and its associated brand catalog
// side by side beat a separate global hub for every action, not just the
// ones where the brand catalog happens to be category-scoped. This hub is
// left with only "Map" (a shortcut into that page) plus WooCommerce's own
// export/import, which have nowhere more specific to live.
const CATEGORY_SYNC_PLATFORMS = [
    { value: 'lazada', label: 'Lazada', mappingRoute: '/catalog/categories/lazada-mapping', exportRoute: null, importRoute: null },
    { value: 'shopee', label: 'Shopee', mappingRoute: '/catalog/categories/shopee-mapping', exportRoute: null, importRoute: null },
    { value: 'tiktok', label: 'TikTok', mappingRoute: '/catalog/categories/tiktok-mapping', exportRoute: null, importRoute: null },
    {
        value: 'woocommerce',
        label: 'WooCommerce',
        mappingRoute: '/catalog/categories/woocommerce-mapping',
        exportRoute: '/catalog/categories/export-woocommerce',
        importRoute: '/catalog/categories/import-woocommerce',
    },
] as const;

type Platform = (typeof CATEGORY_SYNC_PLATFORMS)[number];

function formatLocalDateTime(value: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok' });
}

/** Fiori ObjectStatus tone for how stale a sync timestamp is — never synced (or unparseable) reads as neutral, not an error; there's nothing wrong yet, just nothing done. */
function syncFreshnessTone(value: string | null): FioriTone {
    if (!value) return 'neutral';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'neutral';

    const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) return 'success';
    if (daysSince <= 30) return 'warning';
    return 'error';
}

interface Props {
    lastSyncedAt: Record<string, string | null>;
}

export default function CategoryMarketplaceSync({ lastSyncedAt }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('categories.edit_categories');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '/catalog/management/marketplace' },
        { title: t('marketplaceSyncTitle'), href: '#' },
    ];

    // Keyed by platform value, not a single shared boolean — every row's
    // import button is independently clickable (the old design only ever
    // had one "selected" platform, so one boolean was enough).
    const [importingPlatform, setImportingPlatform] = useState<string | null>(null);

    const runImport = (platform: Platform) => {
        if (!platform.importRoute) return;
        setImportingPlatform(platform.value);
        router.post(platform.importRoute, {}, { onFinish: () => setImportingPlatform(null) });
    };

    const columns: FioriResponsiveColumn<Platform>[] = [
        {
            key: 'marketplace',
            header: t('marketplaceColumn'),
            priority: 'always',
            minWidth: 200,
            render: (platform) => (
                <Stack spacing={0.5}>
                    <Typography fontWeight={600} sx={{ color: FIORI.textPrimary }}>{platform.label}</Typography>
                    <FioriStatus
                        label={t('lastSyncedAt', { datetime: formatLocalDateTime(lastSyncedAt[platform.value] ?? null) })}
                        tone={syncFreshnessTone(lastSyncedAt[platform.value] ?? null)}
                    />
                </Stack>
            ),
        },
        {
            key: 'manage',
            header: t('manageColumn'),
            priority: 'always',
            minWidth: 320,
            render: (platform) => {
                if (!canEdit) {
                    return (
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, fontStyle: 'italic' }}>
                            —
                        </Typography>
                    );
                }

                const isImporting = importingPlatform === platform.value;

                return (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<LinkIcon fontSize="small" />}
                            onClick={() => router.visit(platform.mappingRoute)}
                            sx={fioriDefaultSx}
                        >
                            {t('mapToPlatformCategories', { platform: platform.label })}
                        </Button>

                        {platform.exportRoute && (
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<DownloadIcon fontSize="small" />}
                                component="a"
                                href={platform.exportRoute}
                                sx={fioriDefaultSx}
                            >
                                {t('exportCategoriesCsv')}
                            </Button>
                        )}

                        {platform.importRoute && (
                            <Button
                                size="small"
                                variant="outlined"
                                disabled={isImporting}
                                startIcon={isImporting ? <CircularProgress size={14} /> : <SystemUpdateAltIcon fontSize="small" />}
                                onClick={() => runImport(platform)}
                                sx={fioriDefaultSx}
                            >
                                {isImporting ? t('importingCategories') : t('importAsPimCategories')}
                            </Button>
                        )}
                    </Stack>
                );
            },
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('marketplaceSyncTitle')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700} sx={{ color: FIORI.textPrimary }}>{t('marketplaceSyncTitle')}</Typography>
                    <Typography sx={{ color: FIORI.textSecondary, mt: 0.5 }}>{t('marketplaceSyncSubtitle')}</Typography>
                </Box>

                <FioriResponsiveTable
                    columns={columns}
                    rows={[...CATEGORY_SYNC_PLATFORMS]}
                    getRowKey={(platform) => platform.value}
                />
            </Box>
        </AppLayout>
    );
}
