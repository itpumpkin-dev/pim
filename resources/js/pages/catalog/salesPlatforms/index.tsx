import AppLayout from '@/layouts/app-layout';
import { PALETTE } from '@/theme';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Avatar,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    FormControlLabel,
    IconButton,
    Menu,
    MenuItem,
    Paper,
    Stack,
    Switch,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SalesChannelSectionTabs } from '@/components/catalog/sales-channel-section-tabs';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import {
    FIORI,
    FioriStatus,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
} from '@/lib/fiori-style';

// วนสีตาม index ของ platform (ไม่ใช้สีตามแบรนด์) — เพราะ platform ในหน้านี้
// admin สร้างเองได้อิสระ (ดูที่ storePlatform()) ไม่ได้มีแค่ Lazada/Shopee/
// TikTok เท่านั้น ถ้าทำ map สีตามแบรนด์ตายตัวจะมี platform ที่สร้างเองเหลือไม่มีสี
// เลยใช้ชุดสีวนซ้ำ 4 สีแบบเดียวกับที่กล่องข้อมูลใน dashboard ใช้
const PLATFORM_ACCENT_COLORS = [PALETTE.accent, PALETTE.highlight, PALETTE.primary, PALETTE.secondary];

// จำนวนร้านค้าที่โชว์ก่อนจะสลับเป็นปุ่ม "ดูทั้งหมด" — ตั้งไว้พอให้เห็นภาพรวมของลิสต์
// โดยไม่ทำให้ตารางยาวเกินจอสำหรับ platform ที่มีร้านค้าเยอะๆ
const SHOPS_PREVIEW_COUNT = 3;

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

function linkedAccountLabel(shop: ShopItem): string | null {
    if (shop.lazada_seller_account_id) return `Lazada #${shop.lazada_seller_account_id}`;
    if (shop.shopee_seller_account_id) return `Shopee #${shop.shopee_seller_account_id}`;
    if (shop.tiktok_seller_account_id) return `TikTok #${shop.tiktok_seller_account_id}`;
    return null;
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

    const [activePlatformId, setActivePlatformId] = useState<number | null>(platforms[0]?.id ?? null);
    const activePlatform = platforms.find((p) => p.id === activePlatformId) ?? platforms[0] ?? null;
    const [showAllShops, setShowAllShops] = useState(false);

    const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
    const [editingPlatform, setEditingPlatform] = useState<PlatformItem | null>(null);
    const [platformCode, setPlatformCode] = useState('');
    const [platformName, setPlatformName] = useState('');
    const [deletePlatformId, setDeletePlatformId] = useState<number | null>(null);
    const [savingPlatform, setSavingPlatform] = useState(false);
    const [deletingPlatform, setDeletingPlatform] = useState(false);
    const [platformMenuAnchor, setPlatformMenuAnchor] = useState<HTMLElement | null>(null);

    const [shopDialogPlatformId, setShopDialogPlatformId] = useState<number | null>(null);
    const [editingShop, setEditingShop] = useState<ShopItem | null>(null);
    const [shopCode, setShopCode] = useState('');
    const [shopName, setShopName] = useState('');
    const [shopActive, setShopActive] = useState(true);
    const [deleteShopId, setDeleteShopId] = useState<number | null>(null);
    const [savingShop, setSavingShop] = useState(false);
    const [deletingShop, setDeletingShop] = useState(false);
    const [shopMenuAnchor, setShopMenuAnchor] = useState<{ shopId: number; el: HTMLElement } | null>(null);

    const [syncMenuAnchor, setSyncMenuAnchor] = useState<HTMLElement | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncingShopee, setSyncingShopee] = useState(false);
    const [syncingTiktok, setSyncingTiktok] = useState(false);
    const [syncingLiveStatus, setSyncingLiveStatus] = useState(false);
    const anySyncing = syncing || syncingShopee || syncingTiktok || syncingLiveStatus;

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
        router.post('/catalog/sales-platforms/sync-lazada', {}, { onFinish: () => setSyncing(false) });
    };

    const syncShopee = () => {
        setSyncingShopee(true);
        router.post('/catalog/sales-platforms/sync-shopee', {}, { onFinish: () => setSyncingShopee(false) });
    };

    const syncTiktok = () => {
        setSyncingTiktok(true);
        router.post('/catalog/sales-platforms/sync-tiktok', {}, { onFinish: () => setSyncingTiktok(false) });
    };

    const syncLiveStatus = () => {
        setSyncingLiveStatus(true);
        router.post('/catalog/sales-platforms/sync-live-status', {}, { onFinish: () => setSyncingLiveStatus(false) });
    };

    // sync แยกตามร้าน — ใช้ Set (ไม่ใช่ id เดี่ยวๆ) เพราะอาจมีหลายร้านที่กำลัง
    // sync พร้อมกันได้ เหตุผลเดียวกับ duplicatingIds ใน products/index.tsx
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

    const menuShop = activePlatform?.shops.find((s) => s.id === shopMenuAnchor?.shopId) ?? null;
    const visibleShops = activePlatform ? (showAllShops ? activePlatform.shops : activePlatform.shops.slice(0, SHOPS_PREVIEW_COUNT)) : [];

    // ลำดับการซ่อน/แสดงคอลัมน์เมื่อจอเล็กลง (ตามสไตล์ SAP Fiori responsive table):
    // ชื่อ/code ของร้านกับปุ่มเมนู action จะยังโชว์อยู่แม้จอมือถือแคบๆ
    // ส่วนคอลัมน์บัญชีที่ลิงก์กับสถานะ active เป็นข้อมูลรองเลยถูกซ่อนก่อน
    const shopColumns: FioriResponsiveColumn<ShopItem>[] = [
        {
            key: 'shop',
            header: t('shopsLabel'),
            priority: 'always',
            render: (shop) => (
                <>
                    <Typography variant="body2" fontWeight={600}>{shop.name}</Typography>
                    <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>{shop.code}</Typography>
                </>
            ),
        },
        {
            key: 'linkedAccount',
            header: t('linkedPlatformAccount'),
            priority: 'high',
            render: (shop) =>
                linkedAccountLabel(shop) ?? (
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                        {t('noLinkedAccount')}
                    </Typography>
                ),
        },
        {
            key: 'active',
            header: t('shopActive'),
            priority: 'medium',
            render: (shop) =>
                shop.is_active ? <FioriStatus label={t('shopActive')} tone="success" /> : <FioriStatus label="-" tone="neutral" />,
        },
        {
            key: 'actions',
            header: '',
            priority: 'always',
            align: 'right',
            width: 48,
            render: (shop) =>
                (canEdit || canDelete) && (
                    <IconButton size="small" sx={fioriIconButtonSx} onClick={(e) => setShopMenuAnchor({ shopId: shop.id, el: e.currentTarget })}>
                        <MoreVertIcon fontSize="small" />
                    </IconButton>
                ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('salesPlatformsTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <SalesChannelSectionTabs active="platforms" />

                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-start' }, gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {t('salesPlatformsTitle')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{t('salesPlatformsSubtitle')}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ rowGap: 1 }}>
                        <Button
                            variant="outlined"
                            startIcon={anySyncing ? <CircularProgress size={16} /> : <SyncIcon />}
                            endIcon={<ArrowDropDownIcon />}
                            disabled={anySyncing}
                            onClick={(e) => setSyncMenuAnchor(e.currentTarget)}
                            sx={fioriDefaultSx}
                        >
                            {t('syncData')}
                        </Button>
                        <Menu anchorEl={syncMenuAnchor} open={Boolean(syncMenuAnchor)} onClose={() => setSyncMenuAnchor(null)}>
                            <MenuItem onClick={() => { setSyncMenuAnchor(null); syncLazada(); }} disabled={syncing}>
                                {syncing ? t('syncingLazada') : t('syncFromLazada')}
                            </MenuItem>
                            <MenuItem onClick={() => { setSyncMenuAnchor(null); syncShopee(); }} disabled={syncingShopee}>
                                {syncingShopee ? t('syncingLazada') : t('syncFromShopee')}
                            </MenuItem>
                            <MenuItem onClick={() => { setSyncMenuAnchor(null); syncTiktok(); }} disabled={syncingTiktok}>
                                {syncingTiktok ? t('syncingTiktok') : t('syncFromTiktok')}
                            </MenuItem>
                            <Divider />
                            <MenuItem onClick={() => { setSyncMenuAnchor(null); syncLiveStatus(); }} disabled={syncingLiveStatus}>
                                {syncingLiveStatus ? t('syncingLiveStatus') : t('syncLiveStatus')}
                            </MenuItem>
                        </Menu>
                        {canCreate && (
                            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreatePlatform} sx={fioriEmphasizedSx}>
                                {t('createPlatform')}
                            </Button>
                        )}
                    </Stack>
                </Box>

                {platforms.length === 0 ? (
                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 4, textAlign: 'center' }}>
                        <Typography sx={{ color: FIORI.textSecondary }}>{t('noPlatformsFound')}</Typography>
                    </Paper>
                ) : (
                    <Paper elevation={0} sx={fioriCardSx}>
                        <Tabs
                            value={activePlatform?.id ?? false}
                            onChange={(_, val) => {
                                setActivePlatformId(val);
                                setShowAllShops(false);
                            }}
                            sx={{ px: 2, borderBottom: `1px solid ${FIORI.border}` }}
                        >
                            {platforms.map((platform, index) => (
                                <Tab
                                    key={platform.id}
                                    value={platform.id}
                                    iconPosition="start"
                                    icon={
                                        <Avatar
                                            sx={{
                                                width: 22,
                                                height: 22,
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                bgcolor: PLATFORM_ACCENT_COLORS[index % PLATFORM_ACCENT_COLORS.length],
                                            }}
                                        >
                                            {platform.name.charAt(0).toUpperCase()}
                                        </Avatar>
                                    }
                                    label={`${platform.name} ${platform.shops.length}`}
                                />
                            ))}
                        </Tabs>

                        {activePlatform && (
                            <>
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', px: 2, py: 1 }}>
                                    {canEdit && (
                                        <Button size="small" startIcon={<AddIcon fontSize="small" />} onClick={() => openCreateShop(activePlatform.id)} sx={fioriGhostSx}>
                                            {t('addShop')}
                                        </Button>
                                    )}
                                    {(canEdit || canDelete) && (
                                        <IconButton size="small" sx={fioriIconButtonSx} onClick={(e) => setPlatformMenuAnchor(e.currentTarget)}>
                                            <MoreVertIcon fontSize="small" />
                                        </IconButton>
                                    )}
                                    <Menu anchorEl={platformMenuAnchor} open={Boolean(platformMenuAnchor)} onClose={() => setPlatformMenuAnchor(null)}>
                                        {canEdit && (
                                            <MenuItem
                                                onClick={() => {
                                                    setPlatformMenuAnchor(null);
                                                    openEditPlatform(activePlatform);
                                                }}
                                            >
                                                <EditIcon fontSize="small" sx={{ mr: 1 }} /> {t('editPlatform')}
                                            </MenuItem>
                                        )}
                                        {canDelete && (
                                            <MenuItem
                                                sx={{ color: 'error.main' }}
                                                onClick={() => {
                                                    setPlatformMenuAnchor(null);
                                                    setDeletePlatformId(activePlatform.id);
                                                }}
                                            >
                                                <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> {tGrid('delete')}
                                            </MenuItem>
                                        )}
                                    </Menu>
                                </Box>
                                <Divider />

                                <FioriResponsiveTable
                                    variant="plain"
                                    columns={shopColumns}
                                    rows={visibleShops}
                                    getRowKey={(shop) => shop.id}
                                    emptyMessage={t('noShopsYet')}
                                />

                                {activePlatform.shops.length > SHOPS_PREVIEW_COUNT && (
                                    <Box sx={{ px: 2.5, py: 1.5 }}>
                                        <Button size="small" onClick={() => setShowAllShops((v) => !v)} sx={fioriGhostSx}>
                                            {showAllShops ? t('showFewerShops') : t('viewAllShops', { count: activePlatform.shops.length })}
                                        </Button>
                                    </Box>
                                )}
                            </>
                        )}
                    </Paper>
                )}
            </Box>

            <Menu anchorEl={shopMenuAnchor?.el ?? null} open={Boolean(shopMenuAnchor)} onClose={() => setShopMenuAnchor(null)}>
                {menuShop && canEdit && menuShop.lazada_seller_account_id && (
                    <MenuItem
                        disabled={syncingShopIds.has(menuShop.id)}
                        onClick={() => {
                            const shopId = menuShop.id;
                            setShopMenuAnchor(null);
                            syncShopLiveStatus(shopId);
                        }}
                    >
                        {syncingShopIds.has(menuShop.id) ? (
                            <CircularProgress size={14} sx={{ mr: 1 }} />
                        ) : (
                            <SyncIcon fontSize="small" sx={{ mr: 1 }} />
                        )}
                        {t('syncLiveStatus')}
                    </MenuItem>
                )}
                {menuShop && canEdit && activePlatform && (
                    <MenuItem
                        onClick={() => {
                            openEditShop(activePlatform.id, menuShop);
                            setShopMenuAnchor(null);
                        }}
                    >
                        <EditIcon fontSize="small" sx={{ mr: 1 }} /> {t('editShop')}
                    </MenuItem>
                )}
                {menuShop && canDelete && (
                    <MenuItem
                        sx={{ color: 'error.main' }}
                        onClick={() => {
                            setDeleteShopId(menuShop.id);
                            setShopMenuAnchor(null);
                        }}
                    >
                        <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> {tGrid('delete')}
                    </MenuItem>
                )}
            </Menu>

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
                        <Button onClick={() => setPlatformDialogOpen(false)} sx={fioriGhostSx} disabled={savingPlatform}>
                            {tGrid('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={savingPlatform}
                            startIcon={savingPlatform ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={fioriEmphasizedSx}
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
                        <Button onClick={() => setShopDialogPlatformId(null)} sx={fioriGhostSx} disabled={savingShop}>
                            {tGrid('cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={savingShop}
                            startIcon={savingShop ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={fioriEmphasizedSx}
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
                    <Button onClick={() => setDeletePlatformId(null)} sx={fioriGhostSx} disabled={deletingPlatform}>
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
                        sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
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
                    <Button onClick={() => setDeleteShopId(null)} sx={fioriGhostSx} disabled={deletingShop}>
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
                        sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
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
