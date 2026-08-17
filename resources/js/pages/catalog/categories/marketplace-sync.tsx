import AppLayout from '@/layouts/app-layout';
import { PALETTE } from '@/theme';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import LinkIcon from '@mui/icons-material/Link';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import { Box, Button, Card, CardContent, CircularProgress, Divider, Grid, Stack, Tab, Tabs, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Mirrors salesPlatforms/index.tsx's AdminLTE-style card language (same
// CARD_SHADOW value, same 4-color palette rotation) so the two pages under
// Catalog read as one design system rather than two different ones.
const CARD_SHADOW = '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.2)';
const PLATFORM_ACCENT_COLORS = [PALETTE.accent, PALETTE.highlight, PALETTE.primary, PALETTE.secondary];

// One button + platform picker instead of one dedicated button per platform
// (which doesn't scale — was literally "Sync Lazada Categories" hardcoded).
// Adding another platform's category sync is just one more entry here plus
// its own backend route.
const CATEGORY_SYNC_PLATFORMS = [
    { value: 'lazada', label: 'Lazada', route: '/catalog/categories/sync-lazada', mappingRoute: '/catalog/categories/lazada-mapping' },
    { value: 'shopee', label: 'Shopee', route: '/catalog/categories/sync-shopee', mappingRoute: '/catalog/categories/shopee-mapping' },
    { value: 'tiktok', label: 'TikTok', route: '/catalog/categories/sync-tiktok', mappingRoute: '/catalog/categories/tiktok-mapping' },
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

    const selected = CATEGORY_SYNC_PLATFORMS.find((p) => p.value === syncPlatform) ?? CATEGORY_SYNC_PLATFORMS[0];
    const selectedIndex = CATEGORY_SYNC_PLATFORMS.findIndex((p) => p.value === syncPlatform);
    const selectedColor = PLATFORM_ACCENT_COLORS[Math.max(selectedIndex, 0) % PLATFORM_ACCENT_COLORS.length];

    const runSync = () => {
        setSyncing(true);
        router.post(selected.route, {}, { onFinish: () => setSyncing(false) });
    };

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
                    <Divider sx={{ my: 1 }} />
                    <Typography color="text.secondary">{t('marketplaceSyncSubtitle')}</Typography>
                </Box>

                {/* Platform picker — same info-box language as dashboard.tsx's Row 2 /
                    salesPlatforms/index.tsx's summary strip, doubling as the platform
                    selector for the panel below (click a tile instead of a <Select>). */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                    {CATEGORY_SYNC_PLATFORMS.map((platform, index) => {
                        const color = PLATFORM_ACCENT_COLORS[index % PLATFORM_ACCENT_COLORS.length];
                        const isSelected = platform.value === syncPlatform;

                        return (
                            <Grid item xs={12} sm={6} md={4} key={platform.value} sx={{ display: 'flex' }}>
                                <Box
                                    onClick={() => {
                                        if (syncing) return;
                                        setSyncPlatform(platform.value);
                                    }}
                                    sx={{
                                        display: 'flex',
                                        width: '100%',
                                        borderRadius: '0.25rem',
                                        bgcolor: 'background.paper',
                                        boxShadow: CARD_SHADOW,
                                        overflow: 'hidden',
                                        cursor: syncing ? 'default' : 'pointer',
                                        opacity: syncing && !isSelected ? 0.6 : 1,
                                        outline: isSelected ? `2px solid ${color}` : 'none',
                                        outlineOffset: '-1px',
                                        transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
                                        '&:hover': syncing ? {} : { transform: 'translateY(-2px)', boxShadow: 3 },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 70, bgcolor: color, flexShrink: 0 }}>
                                        <StorefrontOutlinedIcon sx={{ fontSize: 28, color: '#fff' }} />
                                    </Box>
                                    <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <Typography variant="body2" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 600 }}>
                                            {platform.label}
                                        </Typography>
                                        <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.1rem', color: 'text.primary', mt: 0.25 }}>
                                            {t('lastSyncedAt', { datetime: formatLocalDateTime(lastSyncedAt[platform.value] ?? null) })}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        );
                    })}
                </Grid>

                <Card
                    elevation={0}
                    sx={{
                        borderRadius: '0.25rem',
                        borderTop: `3px solid ${selectedColor}`,
                        bgcolor: 'background.paper',
                        boxShadow: CARD_SHADOW,
                        maxWidth: 640,
                    }}
                >
                    <CardContent sx={{ p: 3 }}>
                        <Stack spacing={2.5}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Typography variant="h6" fontWeight={700}>{selected.label}</Typography>
                            </Stack>

                            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                                <Button
                                    variant="outlined"
                                    startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                                    disabled={syncing}
                                    onClick={runSync}
                                >
                                    {syncing ? t('syncingLazada') : t('syncCategories')}
                                </Button>
                                <Button
                                    variant="contained"
                                    sx={{ color: 'white' }}
                                    startIcon={<LinkIcon />}
                                    onClick={() => router.visit(selected.mappingRoute)}
                                >
                                    {t('mapToPlatformCategories', { platform: selected.label })}
                                </Button>
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>
            </Box>
        </AppLayout>
    );
}
