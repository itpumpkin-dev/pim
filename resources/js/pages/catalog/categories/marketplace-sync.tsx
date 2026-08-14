import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import SyncIcon from '@mui/icons-material/Sync';
import LinkIcon from '@mui/icons-material/Link';
import { Box, Button, CircularProgress, MenuItem, Paper, Select, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// One button + platform picker instead of one dedicated button per platform
// (which doesn't scale — was literally "Sync Lazada Categories" hardcoded).
// Adding another platform's category sync is just one more entry here plus
// its own backend route.
const CATEGORY_SYNC_PLATFORMS = [
    { value: 'lazada', label: 'Lazada', route: '/catalog/categories/sync-lazada', mappingRoute: '/catalog/categories/lazada-mapping' },
    { value: 'shopee', label: 'Shopee', route: '/catalog/categories/sync-shopee', mappingRoute: '/catalog/categories/shopee-mapping' },
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

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' },
        { title: t('marketplaceSyncTab'), href: '#' },
    ];

    const [syncing, setSyncing] = useState(false);
    const [syncPlatform, setSyncPlatform] = useState<string>(CATEGORY_SYNC_PLATFORMS[0].value);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('marketplaceSyncTab')} />
            <Box sx={{ p: 4 }}>
                <Tabs
                    value="marketplace-sync"
                    onChange={(_, val) => router.visit(val === 'categories' ? '/catalog/categories' : '/catalog/categories/marketplace-sync')}
                    sx={{ mb: 3 }}
                >
                    <Tab value="categories" label={tNav('categories')} />
                    <Tab value="marketplace-sync" label={t('marketplaceSyncTab')} />
                </Tabs>

                <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('marketplaceSyncTitle')}</Typography>
                    <Typography color="text.secondary">{t('marketplaceSyncSubtitle')}</Typography>
                </Box>

                <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, maxWidth: 640 }}>
                    <Stack spacing={3}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Select
                                value={syncPlatform}
                                onChange={(e) => setSyncPlatform(e.target.value)}
                                size="small"
                                disabled={syncing}
                                sx={{ minWidth: 140 }}
                            >
                                {CATEGORY_SYNC_PLATFORMS.map((p) => (
                                    <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                                ))}
                            </Select>
                            <Button
                                variant="outlined"
                                startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                                disabled={syncing}
                                onClick={() => {
                                    const platform = CATEGORY_SYNC_PLATFORMS.find((p) => p.value === syncPlatform);
                                    if (!platform) return;
                                    setSyncing(true);
                                    router.post(platform.route, {}, { onFinish: () => setSyncing(false) });
                                }}
                            >
                                {syncing ? t('syncingLazada') : t('syncCategories')}
                            </Button>
                        </Stack>

                        <Typography variant="body2" color="text.secondary">
                            {t('lastSyncedAt', { datetime: formatLocalDateTime(lastSyncedAt[syncPlatform] ?? null) })}
                        </Typography>

                        {(() => {
                            const platform = CATEGORY_SYNC_PLATFORMS.find((p) => p.value === syncPlatform);
                            if (!platform) return null;

                            return (
                                <Button
                                    variant="contained"
                                    sx={{ color: 'white', alignSelf: 'flex-start' }}
                                    startIcon={<LinkIcon />}
                                    onClick={() => router.visit(platform.mappingRoute)}
                                >
                                    {t('mapToPlatformCategories', { platform: platform.label })}
                                </Button>
                            );
                        })()}
                    </Stack>
                </Paper>
            </Box>
        </AppLayout>
    );
}
