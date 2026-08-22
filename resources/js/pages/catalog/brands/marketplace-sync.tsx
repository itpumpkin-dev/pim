import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import CancelIcon from '@mui/icons-material/Cancel';
import LinkIcon from '@mui/icons-material/Link';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, Grid, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { solidActionSx, syncDetailCardSx, syncPlatformCardSx } from '@/lib/ui-style';

// `mode` distinguishes how a platform's sync actually runs: Shopee's brand
// list can be huge (one real mapped category alone has 10,000+ brands), so
// it's a queued job polled via job_tracker_id ('queued'). WooCommerce's
// Product Brands endpoint returns everything in a couple of pages
// (confirmed live: 4 brands total) and runs synchronously in the request
// like CategoryController::syncWoocommerceCategories() does ('sync') — no
// polling, the result shows via the app-wide FlashToast success message.
const BRAND_SYNC_PLATFORMS = [
    { value: 'shopee', label: 'Shopee', route: '/catalog/brands/sync-shopee', mappingRoute: '/catalog/brands/shopee-mapping', mode: 'queued' },
    // Lazada's brand list isn't scoped to any category at all (confirmed
    // live: /category/brands/query has no category param) — 153,551 brands
    // total for this account, even bigger than Shopee's per-category count,
    // so it's queued too.
    { value: 'lazada', label: 'Lazada', route: '/catalog/brands/sync-lazada', mappingRoute: '/catalog/brands/lazada-mapping', mode: 'queued' },
    // TikTok's getBrands() can omit category_id for the shop's whole brand
    // list too, but that's still 10,000 records for this account (confirmed
    // live) — queued, same as Shopee/Lazada.
    { value: 'tiktok', label: 'TikTok', route: '/catalog/brands/sync-tiktok', mappingRoute: '/catalog/brands/tiktok-mapping', mode: 'queued' },
    { value: 'woocommerce', label: 'WooCommerce', route: '/catalog/brands/sync-woocommerce', mappingRoute: '/catalog/brands/woocommerce-mapping', mode: 'sync' },
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
    activeSyncJobs: Record<string, number>;
}

export default function BrandMarketplaceSync({ lastSyncedAt, activeSyncJobs }: Props) {
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

    // A 'sync'-mode platform (WooCommerce) finishes via a real Inertia
    // redirect back to this same page, which hands back a fresh
    // `lastSyncedAt` prop — but `lastSynced` state was only seeded from it
    // once on mount, so without this it'd keep showing the pre-sync
    // timestamp until a manual reload. The 'queued' (Shopee) flow updates
    // `lastSynced` itself on job completion (no navigation happens for
    // that flow), so this doesn't interfere with it.
    useEffect(() => {
        setLastSynced(lastSyncedAt);
    }, [lastSyncedAt]);

    const selected = BRAND_SYNC_PLATFORMS.find((p) => p.value === syncPlatform) ?? BRAND_SYNC_PLATFORMS[0];

    useEffect(() => {
        return () => {
            if (pollTimer.current) clearTimeout(pollTimer.current);
        };
    }, []);

    // A full queued brand sync (Shopee or Lazada) can take many minutes —
    // this polls indefinitely rather than giving up after a fixed attempt
    // count like the fast product-push jobs do, since "still running" is
    // the expected state for most of a sync's lifetime, not a failure.
    // The status/cancel endpoints below are generic on job_tracker_id, not
    // tied to any one platform (see BrandController::brandSyncStatus()).
    // Takes platformValue explicitly (not read from `selected.value`) so
    // the mount-time resume effect below can start polling for whichever
    // platform actually has an active job without waiting on a re-render to
    // update `syncPlatform`/`selected` first.
    const pollJobStatus = (jobTrackerId: number, platformValue: string) => {
        fetch(`/catalog/brands/sync-jobs/${jobTrackerId}/status`, { headers: { Accept: 'application/json' } })
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
                    setLastSynced((prev) => ({ ...prev, [platformValue]: body.completed_at ?? new Date().toISOString() }));
                    return;
                }

                if (body.status === 'failed' || body.status === 'cancelled') {
                    const message = body.error_log?.[0]?.message ?? (body.status === 'cancelled' ? 'Sync cancelled.' : 'Sync failed.');
                    setSyncResult({ severity: 'error', message });
                    setSyncing(false);
                    setActiveJobTrackerId(null);
                    return;
                }

                pollTimer.current = setTimeout(() => pollJobStatus(jobTrackerId, platformValue), 2000);
            })
            .catch(() => {
                setSyncResult({ severity: 'error', message: 'Network error while checking sync status.' });
                setSyncing(false);
                setActiveJobTrackerId(null);
            });
    };

    // Restores the "syncing" indicator on mount (including every time this
    // page is navigated back to) if a brand sync is still genuinely running
    // server-side — job_trackers/the queue worker don't stop just because
    // this component unmounted. Prefers the currently-selected platform's
    // job if one exists, otherwise switches selection to whichever platform
    // actually has one, so the indicator lands on the right card. Runs once
    // per mount; `activeSyncJobs` is only ever fresh right after an Inertia
    // visit to this page, same as `lastSyncedAt`.
    useEffect(() => {
        const platformValue = syncPlatform in activeSyncJobs ? syncPlatform : Object.keys(activeSyncJobs)[0];
        const jobTrackerId = platformValue ? activeSyncJobs[platformValue] : undefined;
        if (!jobTrackerId) return;

        if (platformValue !== syncPlatform) setSyncPlatform(platformValue);
        setSyncing(true);
        setActiveJobTrackerId(jobTrackerId);
        pollJobStatus(jobTrackerId, platformValue);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runSync = () => {
        setSyncing(true);
        setSyncResult(null);
        setSyncedCount(null);
        setActiveJobTrackerId(null);

        if (selected.mode === 'sync') {
            // Small, bounded platform (WooCommerce) — runs and finishes
            // within this one request, no job to poll. router.post() is a
            // normal Inertia visit, so the result shows via the app-wide
            // success flash toast rather than the local Alert below.
            router.post(selected.route, {}, { onFinish: () => setSyncing(false) });
            return;
        }

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
                pollJobStatus(body.job_tracker_id, selected.value);
            })
            .catch(() => {
                setSyncResult({ severity: 'error', message: 'Network error while starting sync.' });
                setSyncing(false);
            });
    };

    const cancelSync = () => {
        if (!activeJobTrackerId) return;
        setCancelling(true);

        fetch(`/catalog/brands/sync-jobs/${activeJobTrackerId}/cancel`, {
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
                    {BRAND_SYNC_PLATFORMS.map((platform) => {
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
                                            {t('lastSyncedAt', { datetime: formatLocalDateTime(lastSynced[platform.value] ?? null) })}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        );
                    })}
                </Grid>

                <Card elevation={0} sx={syncDetailCardSx('regular')}>
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
                                        {t('mapToPlatformBrands', { platform: selected.label })}
                                    </Button>
                                    <Button
                                        variant="contained"
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
