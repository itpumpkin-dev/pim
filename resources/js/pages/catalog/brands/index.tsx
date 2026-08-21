import AppLayout from '@/layouts/app-layout';
import { PALETTE } from '@/theme';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadIcon from '@mui/icons-material/CloudUpload';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SaveIcon from '@mui/icons-material/Save';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
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
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';

interface BrandItem {
    id: number;
    code: string;
    admin_label: string | null;
    slug: string | null;
    description: string | null;
    thumbnail_url: string | null;
    parent_id: number | null;
    parent_name: string | null;
    products_count: number;
    mapped_platforms?: string[];
}

interface ParentOption {
    id: number;
    name: string | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    brands: PaginatedData<BrandItem>;
    parentOptions: ParentOption[];
    attributeId: number;
    filters: { search?: string; sort?: string; dir?: string; platform?: string };
}

// Same colors as categories/index.tsx's MAPPED_PLATFORMS for visual
// consistency across the app.
const MAPPED_PLATFORMS: { value: string; label: string; color: string }[] = [
    { value: 'shopee', label: 'Shopee', color: PALETTE.highlight },
    { value: 'woocommerce', label: 'WooCommerce', color: PALETTE.secondary },
    { value: 'lazada', label: 'Lazada', color: PALETTE.accent },
    { value: 'tiktok', label: 'TikTok', color: PALETTE.primary },
];

export default function BrandIndex({ brands, parentOptions, attributeId, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    // Brands are AttributeOption rows under the hood, but split into their
    // own `brands` permission resource (distinct from `attributes`) so a
    // role can be granted one without the other — see the
    // split_brands_permission_from_attributes migration. Add/edit/delete
    // here all go through routes gated by brands.edit_brands, so one check
    // covers the whole page's write actions (viewing the list itself only
    // needs list_brands, already enforced by the index route and the
    // sidebar nav entry).
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('brands.edit_brands');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('brands'), href: '/catalog/brands' },
    ];

    const { data, setData, post, processing, errors, reset } = useForm({
        translations: {} as Record<string, string>,
        slug: '',
        parent_id: '' as number | '',
        description: '',
        thumbnail: null as File | null,
    });
    const thumbnailPreview = useMemo(() => (data.thumbnail ? URL.createObjectURL(data.thumbnail) : null), [data.thumbnail]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        post('/catalog/brands', {
            preserveScroll: true,
            forceFormData: true,
            onSuccess: () => reset(),
        });
    };

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(filters.dir === 'desc' ? 'desc' : 'asc');
    const [platformFilter, setPlatformFilter] = useState(filters.platform ?? '');
    const [deleteBrandId, setDeleteBrandId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/brands', { search, sort: sortField, dir: sortDir, platform: platformFilter }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = brands.current_page ?? 1;
    const lastPage = brands.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/brands', { search, page, sort: sortField, dir: sortDir, platform: platformFilter }, { preserveState: true });
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/brands', { search, sort: field, dir: nextDir, platform: platformFilter }, { preserveState: true });
    };

    const applyPlatformFilter = (value: string) => {
        setPlatformFilter(value);
        router.get('/catalog/brands', { search, sort: sortField, dir: sortDir, platform: value }, { preserveState: true });
    };

    const goToProducts = (option: BrandItem) => {
        const url = `/catalog/products?attribute_filters[0][attribute_id]=${attributeId}&attribute_filters[0][value]=${encodeURIComponent(option.code)}`;
        router.visit(url);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('brandsTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: 'background.default', minHeight: '100%' }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: '#fff7ed',
                            color: 'primary.main',
                        }}
                    >
                        <LocalOfferOutlinedIcon />
                    </Box>
                    <Typography variant="h4" fontWeight={700} color="text.primary">{t('brandsTitle')}</Typography>
                </Stack>
                <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>{t('brandsIntro')}</Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: canEdit ? '340px 1fr' : '1fr' }, gap: 3, alignItems: 'start' }}>
                    {canEdit && (
                    <Paper
                        component="form"
                        onSubmit={submit}
                        sx={{
                            p: 3,
                            borderRadius: 2,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            position: { md: 'sticky' },
                            top: { md: 24 },
                        }}
                    >
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('addNewBrand')}</Typography>
                        <Stack spacing={2.5}>
                            <LocaleLabelFields
                                title={t('name')}
                                description={t('nameHelperText')}
                                values={data.translations}
                                onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                            />
                            <TextField
                                label={t('slug')}
                                fullWidth
                                size="small"
                                value={data.slug}
                                onChange={(e) => setData('slug', e.target.value)}
                                error={Boolean(errors.slug)}
                                helperText={errors.slug || t('slugHelperText')}
                            />
                            <FormControl fullWidth size="small">
                                <InputLabel id="brand-parent-label">{t('parentBrand')}</InputLabel>
                                <Select
                                    labelId="brand-parent-label"
                                    label={t('parentBrand')}
                                    value={data.parent_id}
                                    onChange={(e) => setData('parent_id', e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <MenuItem value="">{t('noneOption')}</MenuItem>
                                    {parentOptions.map((opt) => (
                                        <MenuItem key={opt.id} value={opt.id}>{opt.name}</MenuItem>
                                    ))}
                                </Select>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 1.5 }}>
                                    {t('parentBrandHelperText')}
                                </Typography>
                            </FormControl>
                            <TextField
                                label={t('description')}
                                fullWidth
                                multiline
                                rows={4}
                                size="small"
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                error={Boolean(errors.description)}
                                helperText={errors.description || t('descriptionHelperText')}
                            />
                            <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>{t('imageLabel')}</Typography>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    {thumbnailPreview ? (
                                        <Box
                                            component="img"
                                            src={thumbnailPreview}
                                            alt=""
                                            sx={{ height: 44, width: 44, objectFit: 'cover', borderRadius: 1.5, border: '1px solid #e2e8f0' }}
                                        />
                                    ) : (
                                        <Box
                                            sx={{
                                                height: 44,
                                                width: 44,
                                                borderRadius: 1.5,
                                                border: '1px dashed #cbd5e1',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#94a3b8',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <ImageOutlinedIcon fontSize="small" />
                                        </Box>
                                    )}
                                    <Button component="label" variant="outlined" size="small" startIcon={<UploadIcon />} sx={{ textTransform: 'none', borderRadius: 1.5 }}>
                                        {t('chooseFile')}
                                        <input
                                            type="file"
                                            hidden
                                            accept="image/*"
                                            onChange={(e) => setData('thumbnail', e.target.files?.[0] ?? null)}
                                        />
                                    </Button>
                                </Stack>
                                {data.thumbnail && (
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>{data.thumbnail.name}</Typography>
                                )}
                                {errors.thumbnail && <Alert severity="error" sx={{ mt: 1 }}>{errors.thumbnail}</Alert>}
                            </Box>
                            <Button
                                type="submit"
                                variant="contained"
                                fullWidth
                                sx={{
                                    color: '#fff',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    borderRadius: 1.5,
                                    py: 1,
                                    bgcolor: 'primary.main',
                                    '&:hover': { bgcolor: 'primary.dark' },
                                }}
                                disabled={processing}
                                startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                            >
                                {processing ? t('saving') : t('addNewBrand')}
                            </Button>
                        </Stack>
                    </Paper>
                    )}

                    <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                                {tGrid('results', { count: brands.total })}
                            </Typography>
                            <Stack direction="row" spacing={1.5}>
                                <Select
                                    value={platformFilter}
                                    onChange={(e) => applyPlatformFilter(e.target.value)}
                                    displayEmpty
                                    size="small"
                                    sx={{ minWidth: 180, bgcolor: '#fff' }}
                                >
                                    <MenuItem value="">{t('allPlatforms')}</MenuItem>
                                    {MAPPED_PLATFORMS.map((platform) => (
                                        <MenuItem key={platform.value} value={platform.value}>{platform.label}</MenuItem>
                                    ))}
                                    <MenuItem value="mapped">{t('mappedToAny')}</MenuItem>
                                    <MenuItem value="unmapped">{t('notMapped')}</MenuItem>
                                </Select>
                                <TextField
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={t('searchBrands')}
                                    size="small"
                                    sx={{
                                        minWidth: 260,
                                        bgcolor: '#fff',
                                        borderRadius: 5,
                                        '& .MuiOutlinedInput-root': { borderRadius: 5 },
                                    }}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                            </InputAdornment>
                                        ),
                                    }}
                                />
                            </Stack>
                        </Stack>

                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                            <Table>
                                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>{t('imageLabel')}</TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>
                                            <TableSortLabel active={sortField === 'admin_label'} direction={sortField === 'admin_label' ? sortDir : 'asc'} onClick={() => handleSort('admin_label')}>
                                                {t('name')}
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>
                                            <TableSortLabel active={sortField === 'description'} direction={sortField === 'description' ? sortDir : 'asc'} onClick={() => handleSort('description')}>
                                                {t('description')}
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>
                                            <TableSortLabel active={sortField === 'slug'} direction={sortField === 'slug' ? sortDir : 'asc'} onClick={() => handleSort('slug')}>
                                                {t('slug')}
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }} align="right">
                                            <TableSortLabel active={sortField === 'products_count'} direction={sortField === 'products_count' ? sortDir : 'asc'} onClick={() => handleSort('products_count')}>
                                                {t('productsCount')}
                                            </TableSortLabel>
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>{t('mappedPlatforms')}</TableCell>
                                        {canEdit && <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }} align="right">{tGrid('actionsHeader')}</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {brands.data.map((row) => (
                                        <TableRow key={row.id} hover>
                                            <TableCell>
                                                {row.thumbnail_url ? (
                                                    <Box component="img" src={row.thumbnail_url} alt="" sx={{ height: 38, width: 38, objectFit: 'cover', borderRadius: 1.5, border: '1px solid #e2e8f0' }} />
                                                ) : (
                                                    <Box
                                                        sx={{
                                                            height: 38,
                                                            width: 38,
                                                            borderRadius: 1.5,
                                                            bgcolor: '#f5f3ff',
                                                            border: '1px solid #ede9fe',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            color: '#c4b5fd',
                                                        }}
                                                    >
                                                        <ImageOutlinedIcon fontSize="small" />
                                                    </Box>
                                                )}
                                            </TableCell>
                                            <TableCell sx={{ fontWeight: 600, color: '#1e293b' }}>{row.admin_label || row.code}</TableCell>
                                            <TableCell sx={{ color: 'text.secondary', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {row.description || <Typography component="span" color="text.disabled">—</Typography>}
                                            </TableCell>
                                            <TableCell sx={{ color: 'text.secondary' }}>
                                                {row.slug || <Typography component="span" color="text.disabled">—</Typography>}
                                            </TableCell>
                                            <TableCell align="right">
                                                {row.products_count ? (
                                                    <Tooltip title={t('viewBrandProducts')}>
                                                        <Chip
                                                            label={row.products_count}
                                                            size="small"
                                                            onClick={() => goToProducts(row)}
                                                            sx={{
                                                                bgcolor: '#f5f3ff',
                                                                color: 'primary.main',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                                '&:hover': { bgcolor: '#ede9fe' },
                                                            }}
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    <Typography color="text.disabled">0</Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {row.mapped_platforms && row.mapped_platforms.length > 0 ? (
                                                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                        {MAPPED_PLATFORMS.filter((platform) => row.mapped_platforms!.includes(platform.value)).map((platform) => (
                                                            <Chip
                                                                key={platform.value}
                                                                label={platform.label}
                                                                size="small"
                                                                sx={{ bgcolor: platform.color, color: '#fff', fontWeight: 600 }}
                                                            />
                                                        ))}
                                                    </Box>
                                                ) : (
                                                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                                        {t('notMapped')}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            {canEdit && (
                                                <TableCell align="right">
                                                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                        <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => router.visit(`/catalog/brands/${row.id}/edit`)}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                        <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => setDeleteBrandId(row.id)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Stack>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                    {brands.data.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={canEdit ? 7 : 6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                                                {t('noBrandsFound')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1.5} sx={{ mt: 2 }}>
                            <Typography variant="body2" color="text.secondary">{tGrid('pageOf', { lastPage })}</Typography>
                            <Stack direction="row" spacing={0.2}>
                                <IconButton size="small" disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                                    <FirstPageIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                                    <ChevronLeftIcon fontSize="small" />
                                </IconButton>
                                <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderRadius: 1, display: 'flex', alignItems: 'center' }}>
                                    <Typography variant="body2">{currentPage}</Typography>
                                </Paper>
                                <IconButton size="small" disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                                    <LastPageIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Stack>
                    </Box>
                </Box>
            </Box>

            <Dialog open={deleteBrandId !== null} onClose={() => setDeleteBrandId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('confirmDeleteBrand')}</DialogContentText>
                    {(() => {
                        const target = brands.data.find((b) => b.id === deleteBrandId);
                        const count = target?.products_count ?? 0;
                        if (count === 0) return null;
                        return (
                            <DialogContentText color="error" sx={{ mt: 1.5, fontWeight: 600 }}>
                                {t('deleteBrandProductWarning', { count })}
                            </DialogContentText>
                        );
                    })()}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteBrandId(null)} color="inherit" sx={{ fontWeight: 'bold' }} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteBrandId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/brands/${deleteBrandId}`, {
                                    onSuccess: () => setDeleteBrandId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        disabled={deleting}
                    >
                        {deleting ? <CircularProgress size={16} color="inherit" /> : tGrid('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
