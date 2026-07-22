import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
}
interface GridAction {
    icon: string;
    label: string;
}
interface GridConfig {
    columns: Record<string, GridColumn>;
    actions?: Record<string, GridAction>;
}
interface ProductRow {
    id: number;
    sku: string;
    type: string;
    enabled: boolean;
    family_code?: string;
    family?: { id: number; code: string };
    name?: string | null;
    image_url?: string | null;
    [key: string]: unknown;
}
interface GridData {
    data: ProductRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function ProductIndex({ gridConfig, gridData, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { auth } = usePage<SharedData>().props;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog').toUpperCase(), href: '#' },
        { title: tNav('products').toUpperCase(), href: '/catalog/products' },
    ];
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('products.create_products') || true;
    const canEdit = permissions.includes('products.edit_products') || true;
    const canDelete = permissions.includes('products.delete_products') || true;

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(10);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/products', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(gridData.data.map((row) => row.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: number, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((item) => item !== id));
        }
    };

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('products')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#fbfbfe', minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="#1e1b4b">
                        {t('products')}
                    </Typography>

                    <Stack direction="row" spacing={1.5}>
                        <Button
                            variant="text"
                            startIcon={<FileUploadOutlinedIcon />}
                            sx={{
                                color: 'primary.main',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2,
                                '&:hover': { bgcolor: '#f5f3ff' },
                            }}
                        >
                            {t('quickExport')}
                        </Button>
                        {canCreate && (
                            <Button
                                variant="contained"
                                onClick={() => router.visit('/catalog/products/create')}
                                sx={{
                                    bgcolor: 'primary.main',
                                    color: '#fff',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    px: 2.5,
                                    py: 1,
                                    borderRadius: 1.5,
                                    '&:hover': { bgcolor: 'primary.dark' },
                                }}
                            >
                                {t('createProduct')}
                            </Button>
                        )}
                    </Stack>
                </Stack>

                {/* Search & Controls Row */}
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('search')}
                            size="small"
                            sx={{
                                bgcolor: '#fff',
                                borderRadius: 5,
                                '& .MuiOutlinedInput-root': { borderRadius: 5 },
                                minWidth: 240,
                            }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                        <Button
                            variant="outlined"
                            startIcon={<ViewColumnOutlinedIcon />}
                            sx={{
                                color: '#64748b',
                                borderColor: '#cbd5e1',
                                textTransform: 'none',
                                borderRadius: 1.5,
                                bgcolor: '#fff',
                            }}
                        >
                            {t('columns')}
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<FilterListIcon />}
                            sx={{
                                color: '#64748b',
                                borderColor: '#cbd5e1',
                                textTransform: 'none',
                                borderRadius: 1.5,
                                bgcolor: '#fff',
                            }}
                        >
                            {t('filter')}
                        </Button>

                        <Select
                            value={perPage}
                            onChange={(e) => setPerPage(Number(e.target.value))}
                            size="small"
                            sx={{ bgcolor: '#fff', borderRadius: 1.5, minWidth: 60, height: 36 }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                        </Select>

                        <Typography variant="body2" color="text.secondary">
                            {t('perPage')}
                        </Typography>

                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderRadius: 1, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2">{currentPage}</Typography>
                        </Paper>

                        <Typography variant="body2" color="text.secondary">
                            {t('pageOf', { lastPage })}
                        </Typography>

                        <Stack direction="row" spacing={0.2}>
                            <IconButton size="small" disabled={currentPage <= 1}>
                                <FirstPageIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage <= 1}>
                                <ChevronLeftIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage}>
                                <ChevronRightIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage}>
                                <LastPageIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>
                </Stack>

                {/* Table */}
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <Table sx={{ minWidth: 800 }}>
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        indeterminate={selectedIds.length > 0 && selectedIds.length < gridData.data.length}
                                        checked={gridData.data.length > 0 && selectedIds.length === gridData.data.length}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                    />
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>{t('sku')}</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>{t('image')}</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>{t('name')}</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <span>{t('attributeFamily')}</span>
                                        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                                    </Stack>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>{t('status')}</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>{t('type')}</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>{t('complete')}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: '#475569', py: 1.5 }}>{t('actions')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {gridData.data.map((row) => {
                                const isSelected = selectedIds.includes(row.id);
                                return (
                                    <TableRow key={row.id} hover selected={isSelected}>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                checked={isSelected}
                                                onChange={(e) => handleSelectOne(row.id, e.target.checked)}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ color: '#334155', fontWeight: 500 }}>{row.sku}</TableCell>
                                        <TableCell>
                                            <Box
                                                sx={{
                                                    width: 38,
                                                    height: 38,
                                                    bgcolor: '#f5f3ff',
                                                    borderRadius: 2,
                                                    border: '1px solid #ede9fe',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {row.image_url ? (
                                                    <Box
                                                        component="img"
                                                        src={row.image_url}
                                                        alt={row.name || row.sku}
                                                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    <CategoryOutlinedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ color: '#334155' }}>{typeof row.name === 'string' && row.name ? row.name : '-'}</TableCell>
                                        <TableCell sx={{ color: '#334155' }}>{row.family_code || row.family?.code || t('defaultFamily')}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={row.enabled ? t('enabled') : t('disabled')}
                                                size="small"
                                                sx={{
                                                    bgcolor: row.enabled ? '#22c55e' : '#94a3b8',
                                                    color: '#fff',
                                                    fontWeight: 600,
                                                    height: 22,
                                                    fontSize: '0.75rem',
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ color: '#334155', fontSize: '0.875rem' }}>
                                            {row.type === 'configurable' ? t('configurable') : t('simple')}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={t('notApplicable')}
                                                size="small"
                                                sx={{
                                                    bgcolor: '#cbd5e1',
                                                    color: '#fff',
                                                    fontWeight: 600,
                                                    height: 22,
                                                    fontSize: '0.75rem',
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                {canEdit && (
                                                    <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => router.visit(`/catalog/products/${row.id}/edit`)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                <IconButton size="small" sx={{ color: '#64748b' }}>
                                                    <ContentCopyIcon fontSize="small" />
                                                </IconButton>
                                                {canDelete && (
                                                    <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => setDeleteProductId(row.id)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {gridData.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                        {t('noProductsFound')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteProductId !== null} onClose={() => setDeleteProductId(null)}>
                <DialogTitle>{t('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('confirmDeleteMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteProductId(null)} color="inherit">
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteProductId !== null) {
                                router.delete(`/catalog/products/${deleteProductId}`, {
                                    onSuccess: () => setDeleteProductId(null),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
