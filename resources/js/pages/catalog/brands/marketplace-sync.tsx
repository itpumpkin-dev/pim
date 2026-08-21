import AppLayout from '@/layouts/app-layout';
import { PALETTE } from '@/theme';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import CancelIcon from '@mui/icons-material/Cancel';
import LinkIcon from '@mui/icons-material/Link';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Grid, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Mirrors categories/marketplace-sync.tsx's card language exactly. Kept as
// an array (like CATEGORY_SYNC_PLATFORMS) even with one entry today so a
// second brand-sync platform later is just one more entry plus its own
// backend routes.
const CARD_SHADOW = '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.2)';
const PLATFORM_ACCENT_COLORS = [PALETTE.accent, PALETTE.highlight, PALETTE.primary, PALETTE.secondary];

const BRAND_SYNC_PLATFORMS = [
    { value: 'shopee', label: 'Shopee', route: '/catalog/brands/sync-shopee', mappingRoute: '/catalog/brands/shopee-mapping' },
] as const;

function formatLocalDateTime(value: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok' });
}

function readXsrfToken(): string {
    return decodeURIComponent(
        document.cookie
            .split('; ')
            .find((row) => row.startsWith('XSRF-TOKEN='))
            ?.split('=')[1] ?? '',
    );
}

interface Props {
    lastSyncedAt: Record<string, string | null>;
}

export default function BrandMarketplaceSync({ lastSyncedAt }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('brands.edit_brands');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '/catalog/management/marketplace' },
        { title: t('brandMarketplaceSyncTitle'), href: '#' },
    ];

    const [syncing, setSyncing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [syncedCount, setSyncedCount] = useState<number | null>(null);
    const [syncResult, setSyncResult] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
    const [lastSynced, setLastSynced] = useState(lastSyncedAt);
    const [syncPlatform, setSyncPlatform] = useState<string>(BRAND_SYNC_PLATFORMS[0].value);
    const [activeJobTrackerId, setActiveJobTrackerId] = useState<number | null>(null);
    const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const selected = BRAND_SYNC_PLATFORMS.find((p) => p.value === syncPlatform) ?? BRAND_SYNC_PLATFORMS[0];
    const selectedIndex = BRAND_SYNC_PLATFORMS.findIndex((p) => p.value === syncPlatform);
    const selectedColor = PLATFORM_ACCENT_COLORS[Math.max(selectedIndex, 0) % PLATFORM_ACCENT_COLORS.length];

    useEffect(() => {
        return () => {
            if (pollTimer.current) clearTimeout(pollTimer.current);
        };
    }, []);

    // A full Shopee brand sync can take many minutes (one real mapped
    // category alone has 10,000+ brands) — this polls indefinitely rather
    // than giving up after a fixed attempt count like the fast product-push
    // jobs do, since "still running" is the expected state for most of a
    // sync's lifetime, not a failure.
    const pollJobStatus = (jobTrackerId: number) => {
        fetch(`/catalog/brands/sync-shopee/${jobTrackerId}/status`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok) {
                    setSyncResult({ severity: 'error', message: body.message ?? 'Could not check sync status.' });
                    setSyncing(false);
                    return;
                }

                setSyncedCount(body.total_rows_processed ?? null);

                if (body.status === 'completed') {
                    setSyncResult({ severity: 'success', message: t('brandsSyncedCount', { count: body.total_records_created ?? 0 }) });
                    setSyncing(false);
                    setActiveJobTrackerId(null);
                    setLastSynced((prev) => ({ ...prev, [selected.value]: body.completed_at ?? new Date().toISOString() }));
                    return;
                }

                if (body.status === 'failed' || body.status === 'cancelled') {
                    const message = body.error_log?.[0]?.message ?? (body.status === 'cancelled' ? 'Sync cancelled.' : 'Sync failed.');
                    setSyncResult({ severity: 'error', message });
                    setSyncing(false);
                    setActiveJobTrackerId(null);
                    return;
                }

                pollTimer.current = setTimeout(() => pollJobStatus(jobTrackerId), 2000);
            })
            .catch(() => {
                setSyncResult({ severity: 'error', message: 'Network error while checking sync status.' });
                setSyncing(false);
                setActiveJobTrackerId(null);
            });
    };

    const runSync = () => {
        setSyncing(true);
        setSyncResult(null);
        setSyncedCount(null);
        setActiveJobTrackerId(null);

        fetch(selected.route, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': readXsrfToken(), Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_tracker_id) {
                    setSyncResult({ severity: 'error', message: body.message ?? 'Could not start sync.' });
                    setSyncing(false);
                    return;
                }

                setActiveJobTrackerId(body.job_tracker_id);
                pollJobStatus(body.job_tracker_id);
            })
            .catch(() => {
                setSyncResult({ severity: 'error', message: 'Network error while starting sync.' });
                setSyncing(false);
            });
    };

    const cancelSync = () => {
        if (!activeJobTrackerId) return;
        setCancelling(true);

        fetch(`/catalog/brands/sync-shopee/${activeJobTrackerId}/cancel`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': readXsrfToken(), Accept: 'application/json' },
        })
            .catch(() => {
                setSyncResult({ severity: 'error', message: 'Network error while cancelling sync.' });
            })
            .finally(() => setCancelling(false));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('brandMarketplaceSyncTitle')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('brandMarketplaceSyncTitle')}</Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography color="text.secondary">{t('brandMarketplaceSyncSubtitle')}</Typography>
                </Box>

                <Grid container spacing={3} sx={{ mb: 3 }}>
                    {BRAND_SYNC_PLATFORMS.map((platform, index) => {
                        const color = PLATFORM_ACCENT_COLORS[index % PLATFORM_ACCENT_COLORS.length];
                        const isSelected = platform.value === syncPlatform;

                        return (
                            <Grid item xs={12} sm={6} md={3} key={platform.value} sx={{ display: 'flex' }}>
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
                                            {t('lastSyncedAt', { datetime: formatLocalDateTime(lastSynced[platform.value] ?? null) })}
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

                            {canEdit && (
                                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                                    <Button
                                        variant="outlined"
                                        startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                                        disabled={syncing}
                                        onClick={runSync}
                                    >
                                        {syncing ? t('syncingBrands') : t('syncBrands')}
                                    </Button>
                                    {syncing && activeJobTrackerId && (
                                        <Button
                                            variant="outlined"
                                            color="error"
                                            startIcon={cancelling ? <CircularProgress size={16} color="inherit" /> : <CancelIcon />}
                                            disabled={cancelling}
                                            onClick={cancelSync}
                                        >
                                            {t('cancel')}
                                        </Button>
                                    )}
                                    <Button
                                        variant="contained"
                                        sx={{ color: 'white' }}
                                        startIcon={<LinkIcon />}
                                        onClick={() => router.visit(selected.mappingRoute)}
                                    >
                                        {t('mapToPlatformBrands', { platform: selected.label })}
                                    </Button>
                                </Stack>
                            )}

                            {syncing && syncedCount !== null && (
                                <Typography variant="body2" color="text.secondary">
                                    {t('brandsSyncedCount', { count: syncedCount })}
                                </Typography>
                            )}

                            {syncResult && (
                                <Alert severity={syncResult.severity} sx={{ py: 0 }}>
                                    {syncResult.message}
                                </Alert>
                            )}
                        </Stack>
                    </CardContent>
                </Card>
            </Box>
        </AppLayout>
    );
}
