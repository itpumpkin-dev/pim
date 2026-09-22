import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FIORI, fioriCardSx, fioriEmphasizedSx, fioriIconButtonSx, fioriSearchFieldSx, fioriTableRowSx } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Alert,
    Avatar,
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    InputAdornment,
    Link,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';

interface ShopOption {
    id: number;
    name: string;
}

interface MasterProductRow {
    id: number;
    item_id: string;
    seller_sku: string;
    shop_sku: string | null;
    name: string | null;
    status: string | null;
    quantity: number | null;
    price: string | null;
    image_url: string | null;
    lazada_url: string | null;
    last_synced_at: string | null;
    shop: { id: number; name: string } | null;
}

interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    products: Paginated<MasterProductRow>;
    shops: ShopOption[];
    filters: { search: string; shop_id: number | null; per_page: number };
    totalCached: number;
}

/**
 * "Master Product List" ของ Lazada — โชว์ทุก listing ที่จริงๆ อยู่บน Lazada
 * (cache ไว้ในตาราง lazada_products โดย LazadaProductSyncService::
 * syncMasterProductList()) ไม่ผูกกับ PIM Product เลย — ต่างจาก
 * lazada-products.tsx (Product Mapping) ที่เริ่มจากฝั่ง PIM Product แล้วไปหา
 * mapping หน้านี้เริ่มจากฝั่ง Lazada แล้วโชว์ว่าจริงๆ มีอะไรอยู่บนนั้นบ้าง —
 * ดู LazadaMasterProductsController's docblock
 */
export default function LazadaMasterProducts({ products, shops, filters, totalCached }: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [shopId, setShopId] = useState<number | ''>(filters.shop_id ?? '');
    const [perPage, setPerPage] = useState<number>(filters.per_page ?? 25);
    const [syncing, setSyncing] = useState(false);
    const firstRender = useRef(true);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Catalog', href: '#' },
        { title: 'Master', href: '#' },
        { title: 'Marketplace', href: '#' },
        { title: 'Lazada', href: '/catalog/marketplace/lazada' },
        { title: 'Master Product List', href: '#' },
    ];

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get(
                '/catalog/marketplace/lazada/master-products',
                { search, shop_id: shopId || undefined, per_page: perPage },
                { preserveState: true, replace: true },
            );
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const applyShopFilter = (value: number | '') => {
        setShopId(value);
        router.get('/catalog/marketplace/lazada/master-products', { search, shop_id: value || undefined, per_page: perPage }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/marketplace/lazada/master-products', { search, shop_id: shopId || undefined, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/marketplace/lazada/master-products', { search, shop_id: shopId || undefined, per_page: perPage, page }, { preserveState: true });
    };

    // ไม่มี concept "ลบ/เขียนทับข้อมูลจริงบน Lazada" เลย (อ่านอย่างเดียว) — เลย
    // ไม่ต้องมี confirm dialog เตือนแบบปุ่ม sync attribute family/mapping อื่นๆ
    // ในระบบนี้ แค่บอก loading state เฉยๆ ก็พอ
    const syncNow = () => {
        setSyncing(true);
        router.post(
            '/catalog/marketplace/lazada/master-products/sync',
            {},
            {
                preserveScroll: true,
                onFinish: () => setSyncing(false),
            },
        );
    };

    const currentPage = products.current_page ?? 1;
    const lastPage = products.last_page ?? 1;

    const columns: FioriResponsiveColumn<MasterProductRow>[] = [
        {
            key: 'product',
            header: 'สินค้า',
            priority: 'always',
            minWidth: 260,
            render: (row) => (
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar
                        variant="rounded"
                        src={row.image_url ?? undefined}
                        sx={{ width: 40, height: 40, bgcolor: FIORI.neutralBg }}
                    />
                    <Box>
                        <Typography variant="body2" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {row.name || row.seller_sku}
                        </Typography>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                            {row.seller_sku}
                        </Typography>
                    </Box>
                </Stack>
            ),
        },
        {
            key: 'shop',
            header: 'ร้าน',
            priority: 'high',
            minWidth: 160,
            render: (row) => (
                <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>
                    {row.shop?.name ?? '—'}
                </Typography>
            ),
        },
        {
            key: 'status',
            header: 'สถานะบน Lazada',
            priority: 'high',
            minWidth: 140,
            render: (row) => (
                <Typography
                    variant="body2"
                    sx={{ color: row.status?.toLowerCase() === 'active' ? FIORI.success : FIORI.textSecondary, fontWeight: 600 }}
                >
                    {row.status ?? '—'}
                </Typography>
            ),
        },
        {
            key: 'quantity',
            header: 'คงเหลือ',
            priority: 'medium',
            align: 'right',
            minWidth: 90,
            render: (row) => <Typography variant="body2">{row.quantity ?? '—'}</Typography>,
        },
        {
            key: 'price',
            header: 'ราคา',
            priority: 'medium',
            align: 'right',
            minWidth: 100,
            render: (row) => <Typography variant="body2">{row.price ?? '—'}</Typography>,
        },
        {
            key: 'item_id',
            header: 'Item ID',
            priority: 'low',
            minWidth: 120,
            render: (row) => (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                    {row.item_id}
                </Typography>
            ),
        },
        {
            key: 'action',
            header: '',
            priority: 'always',
            align: 'right',
            minWidth: 48,
            render: (row) =>
                row.lazada_url ? (
                    <IconButton size="small" sx={fioriIconButtonSx} component={Link} href={row.lazada_url} target="_blank" rel="noopener noreferrer">
                        <OpenInNewIcon fontSize="small" />
                    </IconButton>
                ) : null,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Lazada Master Product List" />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }} flexWrap="wrap" spacing={2}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            Master Product List — Lazada ({totalCached})
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            สินค้าที่จริงๆ อยู่บน Lazada ทุกร้าน (cache ไว้ดู ไม่ผูกกับสินค้าใน PIM)
                        </Typography>
                    </Box>
                    <Button
                        variant="contained"
                        disabled={syncing}
                        startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon fontSize="small" />}
                        onClick={syncNow}
                        sx={fioriEmphasizedSx}
                    >
                        {syncing ? 'กำลัง Sync...' : 'Sync ทุกร้านตอนนี้'}
                    </Button>
                </Stack>

                <Paper elevation={0} sx={fioriCardSx}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ p: 2 }}>
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                            <TextField
                                size="small"
                                placeholder="ค้นหาตามชื่อสินค้า หรือ SKU..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{ ...fioriSearchFieldSx, minWidth: 260 }}
                            />
                            <Select
                                size="small"
                                value={shopId}
                                onChange={(e) => applyShopFilter(e.target.value === '' ? '' : Number(e.target.value))}
                                displayEmpty
                                sx={{ minWidth: 180, bgcolor: FIORI.surface, borderRadius: '8px' }}
                            >
                                <MenuItem value="">ทุกร้าน</MenuItem>
                                {shops.map((shop) => (
                                    <MenuItem key={shop.id} value={shop.id}>
                                        {shop.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Stack>

                        <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'space-between', md: 'flex-end' } }}>
                            <Select
                                value={perPage}
                                onChange={(e) => handlePerPageChange(Number(e.target.value))}
                                size="small"
                                sx={{ bgcolor: FIORI.surface, borderRadius: '8px', minWidth: 60, height: 34 }}
                            >
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={25}>25</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                                <MenuItem value={100}>100</MenuItem>
                            </Select>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                ต่อหน้า
                            </Typography>
                            <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                            </Paper>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                / {lastPage}
                            </Typography>
                            <Stack direction="row" spacing={0.2}>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                                    <FirstPageIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                                    <ChevronLeftIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                                    <LastPageIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Stack>
                    </Stack>

                    <Divider sx={{ borderColor: FIORI.border }} />

                    {totalCached === 0 ? (
                        <Box sx={{ p: 4 }}>
                            <Alert severity="info">
                                ยังไม่มีข้อมูล Master Product List เลย — กด &quot;Sync ทุกร้านตอนนี้&quot; เพื่อดึงข้อมูลจาก Lazada มาเก็บไว้ครั้งแรก
                            </Alert>
                        </Box>
                    ) : (
                        <FioriResponsiveTable
                            variant="plain"
                            columns={columns}
                            rows={products.data}
                            getRowKey={(row: MasterProductRow) => row.id}
                            rowSx={() => fioriTableRowSx(false)}
                            emptyMessage="ไม่พบสินค้าที่ตรงตามเงื่อนไข"
                        />
                    )}

                    <Box sx={{ px: 2, py: 1.5, borderTop: `1px solid ${FIORI.border}` }}>
                        <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                            แสดง {products.data.length} จาก {products.total} รายการ
                        </Typography>
                    </Box>
                </Paper>
            </Box>
        </AppLayout>
    );
}
