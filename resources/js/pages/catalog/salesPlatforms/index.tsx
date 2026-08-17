import AppLayout from '@/layouts/app-layout';
import { PALETTE } from '@/theme';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';
import StoreOutlinedIcon from '@mui/icons-material/StoreOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    FormControlLabel,
    Grid,
    IconButton,
    Paper,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Mirrors dashboard.tsx's AdminLTE-style card language (CARD_SHADOW,
// TH_SX/TD_SX/TR_SX) so this page reads as the same design system rather
// than the plain default-MUI look it had before.
const CARD_SHADOW = '0 0 1px rgba(0,0,0,.125), 0 1px 3px rgba(0,0,0,.2)';

const TH_SX = { padding: '12px 20px', fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em' };
const TD_SX = { padding: '12px 20px', fontSize: '0.875rem' };
const TR_SX = {
    borderBottom: '1px solid',
    borderColor: 'divider',
    transition: 'background-color 0.15s',
    '&:hover': { bgcolor: 'action.hover' },
    '&:last-of-type': { borderBottom: 'none' },
};

// Cycled by platform index (not brand colors) — this page's platforms are
// admin-created and arbitrary (see storePlatform()), not just Lazada/Shopee/
// TikTok, so a per-brand color map would leave any custom platform
// uncolored. Same 4-color rotation the dashboard's own info boxes use.
const PLATFORM_ACCENT_COLORS = [PALETTE.accent, PALETTE.highlight, PALETTE.primary, PALETTE.secondary];

interface ShopItem {
    id: number;
    code: string;
    name: string;
    lazada_seller_account_id: number | null;
    shopee_seller_account_id: string | null;
    tiktok_seller_account_id: number | null;
    is_active: boolean;
}

interface PlatformItem {
    id: number;
    code: string;
    name: string;
    shops: ShopItem[];
}

interface Props {
    platforms: PlatformItem[];
}

export default function SalesPlatformIndex({ platforms }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('sales_platforms.create_sales_platforms');
    const canEdit = permissions.includes('sales_platforms.edit_sales_platforms');
    const canDelete = permissions.includes('sales_platforms.delete_sales_platforms');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('channels'), href: '/catalog/channels' },
    ];

    // Summary strip counts — derived straight from the same `platforms` prop
    // the sections below render, not a separate fetch.
    const allShops = platforms.flatMap((p) => p.shops);
    const totalShops = allShops.length;
    const activeShopsCount = allShops.filter((s) => s.is_active).length;
    const linkedShopsCount = allShops.filter(
        (s) => s.lazada_seller_account_id || s.shopee_seller_account_id || s.tiktok_seller_account_id,
    ).length;

    const summaryBoxes = [
        { title: t('salesPlatformsTab'), value: platforms.length, icon: <StorefrontOutlinedIcon sx={{ fontSize: 28, color: '#fff' }} />, iconBg: PALETTE.accent },
        { title: t('shopsLabel'), value: totalShops, icon: <StoreOutlinedIcon sx={{ fontSize: 28, color: '#fff' }} />, iconBg: PALETTE.highlight },
        { title: t('shopActive'), value: activeShopsCount, icon: <CheckCircleOutlineIcon sx={{ fontSize: 28, color: '#fff' }} />, iconBg: PALETTE.primary },
        { title: t('linkedPlatformAccount'), value: linkedShopsCount, icon: <LinkIcon sx={{ fontSize: 28, color: '#fff' }} />, iconBg: PALETTE.secondary },
    ];

    const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
    const [editingPlatform, setEditingPlatform] = useState<PlatformItem | null>(null);
    const [platformCode, setPlatformCode] = useState('');
    const [platformName, setPlatformName] = useState('');
    const [deletePlatformId, setDeletePlatformId] = useState<number | null>(null);
    const [savingPlatform, setSavingPlatform] = useState(false);
    const [deletingPlatform, setDeletingPlatform] = useState(false);

    const [shopDialogPlatformId, setShopDialogPlatformId] = useState<number | null>(null);
    const [editingShop, setEditingShop] = useState<ShopItem | null>(null);
    const [shopCode, setShopCode] = useState('');
    const [shopName, setShopName] = useState('');
    const [shopActive, setShopActive] = useState(true);
    const [deleteShopId, setDeleteShopId] = useState<number | null>(null);
    const [savingShop, setSavingShop] = useState(false);
    const [deletingShop, setDeletingShop] = useState(false);

    const [syncing, setSyncing] = useState(false);

    const openCreatePlatform = () => {
        setEditingPlatform(null);
        setPlatformCode('');
        setPlatformName('');
        setPlatformDialogOpen(true);
    };

    const openEditPlatform = (platform: PlatformItem) => {
        setEditingPlatform(platform);
        setPlatformCode(platform.code);
        setPlatformName(platform.name);
        setPlatformDialogOpen(true);
    };

    const submitPlatform = (e: FormEvent) => {
        e.preventDefault();
        setSavingPlatform(true);
        if (editingPlatform) {
            router.put(`/catalog/sales-platforms/${editingPlatform.id}`, { name: platformName }, {
                onSuccess: () => setPlatformDialogOpen(false),
                onFinish: () => setSavingPlatform(false),
            });
        } else {
            router.post('/catalog/sales-platforms', { name: platformName }, {
                onSuccess: () => setPlatformDialogOpen(false),
                onFinish: () => setSavingPlatform(false),
            });
        }
    };

    const openCreateShop = (platformId: number) => {
        setShopDialogPlatformId(platformId);
        setEditingShop(null);
        setShopCode('');
        setShopName('');
        setShopActive(true);
    };

    const openEditShop = (platformId: number, shop: ShopItem) => {
        setShopDialogPlatformId(platformId);
        setEditingShop(shop);
        setShopCode(shop.code);
        setShopName(shop.name);
        setShopActive(shop.is_active);
    };

    const submitShop = (e: FormEvent) => {
        e.preventDefault();
        setSavingShop(true);
        if (editingShop) {
            router.put(`/catalog/sales-platforms/shops/${editingShop.id}`, { name: shopName, is_active: shopActive }, {
                onSuccess: () => setShopDialogPlatformId(null),
                onFinish: () => setSavingShop(false),
            });
        } else if (shopDialogPlatformId) {
            router.post(`/catalog/sales-platforms/${shopDialogPlatformId}/shops`, { name: shopName, is_active: shopActive }, {
                onSuccess: () => setShopDialogPlatformId(null),
                onFinish: () => setSavingShop(false),
            });
        }
    };

    const syncLazada = () => {
        setSyncing(true);
        router.post(
            '/catalog/sales-platforms/sync-lazada',
            {},
            {
                onFinish: () => setSyncing(false),
            },
        );
    };

    const [syncingShopee, setSyncingShopee] = useState(false);
    const syncShopee = () => {
        setSyncingShopee(true);
        router.post(
            '/catalog/sales-platforms/sync-shopee',
            {},
            {
                onFinish: () => setSyncingShopee(false),
            },
        );
    };

    const [syncingTiktok, setSyncingTiktok] = useState(false);
    const syncTiktok = () => {
        setSyncingTiktok(true);
        router.post(
            '/catalog/sales-platforms/sync-tiktok',
            {},
            {
                onFinish: () => setSyncingTiktok(false),
            },
        );
    };

    const [syncingLiveStatus, setSyncingLiveStatus] = useState(false);
    const syncLiveStatus = () => {
        setSyncingLiveStatus(true);
        router.post(
            '/catalog/sales-platforms/sync-live-status',
            {},
            {
                onFinish: () => setSyncingLiveStatus(false),
            },
        );
    };

    // Per-shop sync — a Set (not a single id) since more than one shop's
    // sync could be in flight at once, same reasoning as products/index.tsx's
    // duplicatingIds.
    const [syncingShopIds, setSyncingShopIds] = useState<Set<number>>(new Set());
    const syncShopLiveStatus = (shopId: number) => {
        setSyncingShopIds((prev) => new Set(prev).add(shopId));
        router.post(
            `/catalog/sales-platforms/shops/${shopId}/sync-live-status`,
            {},
            {
                onFinish: () =>
                    setSyncingShopIds((prev) => {
                        const next = new Set(prev);
                        next.delete(shopId);
                        return next;
                    }),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('salesPlatformsTitle')} />
            <Box sx={{ p: 4 }}>
                <Tabs
                    value="platforms"
                    onChange={(_, val) => router.visit(val === 'channels' ? '/catalog/channels' : '/catalog/sales-platforms')}
                    sx={{ mb: 3 }}
                >
                    <Tab value="channels" label={t('channelsTab')} />
                    <Tab value="platforms" label={t('salesPlatformsTab')} />
                </Tabs>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Typography variant="h4" fontWeight={700}>
                        {t('salesPlatformsTitle')}
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button variant="outlined" startIcon={<SyncIcon />} onClick={syncLazada} disabled={syncing}>
                            {syncing ? t('syncingLazada') : t('syncFromLazada')}
                        </Button>
                        <Button variant="outlined" startIcon={<SyncIcon />} onClick={syncShopee} disabled={syncingShopee}>
                            {syncingShopee ? t('syncingLazada') : t('syncFromShopee')}
                        </Button>
                        <Button variant="outlined" startIcon={<SyncIcon />} onClick={syncTiktok} disabled={syncingTiktok}>
                            {syncingTiktok ? t('syncingTiktok') : t('syncFromTiktok')}
                        </Button>
                        <Button variant="outlined" startIcon={<SyncIcon />} onClick={syncLiveStatus} disabled={syncingLiveStatus}>
                            {syncingLiveStatus ? t('syncingLiveStatus') : t('syncLiveStatus')}
                        </Button>
                        {canCreate && (
                            <Button sx={{ color: 'white' }} variant="contained" startIcon={<AddIcon />} onClick={openCreatePlatform}>
                                {t('createPlatform')}
                            </Button>
                        )}
                    </Stack>
                </Box>

                {/* Summary strip — same info-box language as dashboard.tsx's Row 2 */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    {summaryBoxes.map((box, i) => (
                        <Grid item xs={12} sm={6} md={3} key={i} sx={{ display: 'flex' }}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    width: '100%',
                                    borderRadius: '0.25rem',
                                    bgcolor: 'background.paper',
                                    boxShadow: CARD_SHADOW,
                                    overflow: 'hidden',
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 70, bgcolor: box.iconBg, flexShrink: 0 }}>
                                    {box.icon}
                                </Box>
                                <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <Typography variant="body2" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 600 }}>
                                        {box.title}
                                    </Typography>
                                    <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.25rem', color: 'text.primary', mt: 0.25 }}>
                                        {box.value}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>
                    ))}
                </Grid>

                {platforms.length === 0 && (
                    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                        <Typography color="text.secondary">{t('noPlatformsFound')}</Typography>
                    </Paper>
                )}

                <Stack spacing={3}>
                    {platforms.map((platform, index) => (
                        <Card
                            key={platform.id}
                            elevation={0}
                            sx={{
                                borderRadius: '0.25rem',
                                borderTop: `3px solid ${PLATFORM_ACCENT_COLORS[index % PLATFORM_ACCENT_COLORS.length]}`,
                                bgcolor: 'background.paper',
                                boxShadow: CARD_SHADOW,
                            }}
                        >
                            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 2 }}>
                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                        <Typography variant="h6" fontWeight={700}>
                                            {platform.name}
                                        </Typography>
                                        <Chip label={platform.code} size="small" variant="outlined" />
                                        <Chip label={`${t('shopsLabel')}: ${platform.shops.length}`} size="small" />
                                    </Stack>
                                    <Stack direction="row" spacing={0.5}>
                                        {canEdit && (
                                            <IconButton size="small" onClick={() => openEditPlatform(platform)}>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        )}
                                        {canDelete && (
                                            <IconButton size="small" color="error" onClick={() => setDeletePlatformId(platform.id)}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        )}
                                    </Stack>
                                </Box>
                                <Divider />
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={TH_SX}>{t('shopCode')}</TableCell>
                                                <TableCell sx={TH_SX}>{t('shopName')}</TableCell>
                                                <TableCell sx={TH_SX}>{t('linkedPlatformAccount')}</TableCell>
                                                <TableCell sx={TH_SX}>{t('shopActive')}</TableCell>
                                                {(canEdit || canDelete) && (
                                                    <TableCell sx={{ ...TH_SX, textAlign: 'right' }}>{tGrid('actionsHeader')}</TableCell>
                                                )}
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {platform.shops.map((shop) => (
                                                <TableRow key={shop.id} sx={TR_SX}>
                                                    <TableCell sx={TD_SX}>{shop.code}</TableCell>
                                                    <TableCell sx={{ ...TD_SX, fontWeight: 600 }}>{shop.name}</TableCell>
                                                    <TableCell sx={TD_SX}>
                                                        {shop.lazada_seller_account_id ? (
                                                            <Chip label={`Lazada #${shop.lazada_seller_account_id}`} size="small" color="success" variant="outlined" />
                                                        ) : shop.shopee_seller_account_id ? (
                                                            <Chip label={`Shopee #${shop.shopee_seller_account_id}`} size="small" color="success" variant="outlined" />
                                                        ) : shop.tiktok_seller_account_id ? (
                                                            <Chip label={`TikTok #${shop.tiktok_seller_account_id}`} size="small" color="success" variant="outlined" />
                                                        ) : (
                                                            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                                                {t('noLinkedAccount')}
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell sx={TD_SX}>
                                                        <Chip
                                                            label={shop.is_active ? t('shopActive') : '-'}
                                                            size="small"
                                                            color={shop.is_active ? 'success' : 'default'}
                                                        />
                                                    </TableCell>
                                                    {(canEdit || canDelete) && (
                                                        <TableCell sx={{ ...TD_SX, textAlign: 'right' }}>
                                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                                {canEdit && shop.lazada_seller_account_id && (
                                                                    <IconButton
                                                                        size="small"
                                                                        title={t('syncLiveStatus')}
                                                                        disabled={syncingShopIds.has(shop.id)}
                                                                        onClick={() => syncShopLiveStatus(shop.id)}
                                                                    >
                                                                        {syncingShopIds.has(shop.id) ? (
                                                                            <CircularProgress size={16} />
                                                                        ) : (
                                                                            <SyncIcon fontSize="small" />
                                                                        )}
                                                                    </IconButton>
                                                                )}
                                                                {canEdit && (
                                                                    <IconButton size="small" onClick={() => openEditShop(platform.id, shop)}>
                                                                        <EditIcon fontSize="small" />
                                                                    </IconButton>
                                                                )}
                                                                {canDelete && (
                                                                    <IconButton size="small" color="error" onClick={() => setDeleteShopId(shop.id)}>
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                )}
                                                            </Stack>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                            {platform.shops.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center" sx={TD_SX}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            {t('noShopsYet')}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                {canEdit && (
                                    <Box sx={{ px: 2.5, py: 2 }}>
                                        <Button size="small" startIcon={<AddIcon />} onClick={() => openCreateShop(platform.id)}>
                                            {t('addShop')}
                                        </Button>
                                    </Box>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            </Box>

            <Dialog open={platformDialogOpen} onClose={() => setPlatformDialogOpen(false)} maxWidth="xs" fullWidth>
                <Box component="form" onSubmit={submitPlatform}>
                    <DialogTitle>{editingPlatform ? t('editPlatform') : t('createPlatform')}</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2.5} sx={{ mt: 1 }}>
                            {editingPlatform && (
                                <TextField
                                    label={t('platformCode')}
                                    fullWidth
                                    size="small"
                                    value={platformCode}
                                    disabled
                                    helperText="This code is generated automatically and can't be changed."
                                />
                            )}
                            <TextField
                                label={t('platformName')}
                                required
                                fullWidth
                                size="small"
                                value={platformName}
                                onChange={(e) => setPlatformName(e.target.value)}
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setPlatformDialogOpen(false)} color="inherit" disabled={savingPlatform}>
                            {tGrid('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={savingPlatform}
                            startIcon={savingPlatform ? <CircularProgress size={16} color="inherit" /> : undefined}
                        >
                            {t('save')}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <Dialog open={shopDialogPlatformId !== null} onClose={() => setShopDialogPlatformId(null)} maxWidth="xs" fullWidth>
                <Box component="form" onSubmit={submitShop}>
                    <DialogTitle>{editingShop ? t('editShop') : t('addShop')}</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2.5} sx={{ mt: 1 }}>
                            {editingShop && (
                                <TextField
                                    label={t('shopCode')}
                                    fullWidth
                                    size="small"
                                    value={shopCode}
                                    disabled
                                    helperText="This code is generated automatically and can't be changed."
                                />
                            )}
                            <TextField
                                label={t('shopName')}
                                required
                                fullWidth
                                size="small"
                                value={shopName}
                                onChange={(e) => setShopName(e.target.value)}
                            />
                            <FormControlLabel
                                control={<Switch checked={shopActive} onChange={(e) => setShopActive(e.target.checked)} />}
                                label={t('shopActive')}
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setShopDialogPlatformId(null)} color="inherit" disabled={savingShop}>
                            {tGrid('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={savingShop}
                            startIcon={savingShop ? <CircularProgress size={16} color="inherit" /> : undefined}
                        >
                            {t('save')}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            <Dialog open={deletePlatformId !== null} onClose={() => setDeletePlatformId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('confirmDeletePlatform')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeletePlatformId(null)} color="inherit" sx={{ fontWeight: 'bold' }} disabled={deletingPlatform}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deletePlatformId !== null) {
                                setDeletingPlatform(true);
                                router.delete(`/catalog/sales-platforms/${deletePlatformId}`, {
                                    onSuccess: () => setDeletePlatformId(null),
                                    onFinish: () => setDeletingPlatform(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        sx={{ fontWeight: 'bold' }}
                        disabled={deletingPlatform}
                        startIcon={deletingPlatform ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        {tGrid('delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteShopId !== null} onClose={() => setDeleteShopId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('confirmDeleteShop')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteShopId(null)} color="inherit" sx={{ fontWeight: 'bold' }} disabled={deletingShop}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteShopId !== null) {
                                setDeletingShop(true);
                                router.delete(`/catalog/sales-platforms/shops/${deleteShopId}`, {
                                    onSuccess: () => setDeleteShopId(null),
                                    onFinish: () => setDeletingShop(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        sx={{ fontWeight: 'bold' }}
                        disabled={deletingShop}
                        startIcon={deletingShop ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        {tGrid('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
