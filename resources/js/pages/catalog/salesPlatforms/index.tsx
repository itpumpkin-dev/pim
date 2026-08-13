import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
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

interface ShopItem {
    id: number;
    code: string;
    name: string;
    lazada_seller_account_id: number | null;
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

                {platforms.length === 0 && (
                    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                        <Typography color="text.secondary">{t('noPlatformsFound')}</Typography>
                    </Paper>
                )}

                <Stack spacing={2}>
                    {platforms.map((platform) => (
                        <Accordion key={platform.id} defaultExpanded variant="outlined">
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 1 }}>
                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                        <Typography variant="h6" fontWeight={700}>
                                            {platform.name}
                                        </Typography>
                                        <Chip label={platform.code} size="small" variant="outlined" />
                                        <Chip label={`${t('shopsLabel')}: ${platform.shops.length}`} size="small" />
                                    </Stack>
                                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
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
                            </AccordionSummary>
                            <AccordionDetails>
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700 }}>{t('shopCode')}</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>{t('shopName')}</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>{t('linkedLazadaAccount')}</TableCell>
                                                <TableCell sx={{ fontWeight: 700 }}>{t('shopActive')}</TableCell>
                                                {(canEdit || canDelete) && (
                                                    <TableCell sx={{ fontWeight: 700 }} align="right">
                                                        {tGrid('actionsHeader')}
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {platform.shops.map((shop) => (
                                                <TableRow key={shop.id}>
                                                    <TableCell>{shop.code}</TableCell>
                                                    <TableCell sx={{ fontWeight: 600 }}>{shop.name}</TableCell>
                                                    <TableCell>
                                                        {shop.lazada_seller_account_id ? (
                                                            <Chip label={`#${shop.lazada_seller_account_id}`} size="small" color="success" variant="outlined" />
                                                        ) : (
                                                            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                                                {t('noLazadaAccount')}
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={shop.is_active ? t('shopActive') : '-'}
                                                            size="small"
                                                            color={shop.is_active ? 'success' : 'default'}
                                                        />
                                                    </TableCell>
                                                    {(canEdit || canDelete) && (
                                                        <TableCell align="right">
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
                                                    <TableCell colSpan={5} align="center">
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
                                    <Button size="small" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={() => openCreateShop(platform.id)}>
                                        {t('addShop')}
                                    </Button>
                                )}
                            </AccordionDetails>
                        </Accordion>
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
