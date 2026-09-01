import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import {
    FIORI,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

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
    filters: { search?: string; sort?: string; dir?: string };
}

export default function BrandIndex({ brands, parentOptions, attributeId, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    // จริงๆ แล้ว Brand คือแถวข้อมูลของ AttributeOption ข้างในนั่นแหละ แต่แยกออกมาเป็น
    // permission resource ของตัวเอง (`brands`) ต่างหากจาก `attributes` เพื่อให้กำหนดสิทธิ์
    // ให้ role ใช้อย่างใดอย่างหนึ่งได้โดยไม่ต้องให้อีกอันด้วย — ดูได้จาก migration
    // split_brands_permission_from_attributes การเพิ่ม/แก้ไข/ลบ ที่นี่ทั้งหมดจะผ่าน
    // route ที่เช็คสิทธิ์ brands.edit_brands ดังนั้นเช็คแค่ตัวเดียวก็ครอบคลุมการเขียนข้อมูล
    // ทั้งหน้าแล้ว (แค่ดูรายการเฉยๆ ใช้แค่สิทธิ์ list_brands ซึ่ง route index กับเมนู sidebar
    // บังคับเช็คให้อยู่แล้ว)
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('brands.edit_brands');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('brands'), href: '/catalog/brands' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(filters.dir === 'desc' ? 'desc' : 'asc');
    const [deleteBrandId, setDeleteBrandId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/brands', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = brands.current_page ?? 1;
    const lastPage = brands.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/brands', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/brands', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const goToProducts = (option: BrandItem) => {
        const url = `/catalog/products?attribute_filters[0][attribute_id]=${attributeId}&attribute_filters[0][value]=${encodeURIComponent(option.code)}`;
        router.visit(url);
    };

    // ลำดับความสำคัญของคอลัมน์เวลาจอแคบ (ตาราง responsive แบบ SAP Fiori): ชื่อแบรนด์ใช้
    // ระบุแถวและปุ่ม actions ต้องโชว์ตลอดแม้จอมือถือแคบสุด ส่วน chip นับจำนวนสินค้าเป็น
    // ปุ่มที่กดใช้งานได้จริง (กดแล้วไปหน้าสินค้าของแบรนด์นั้น) เลยได้ความสำคัญรองลงมา
    // ตามด้วยแพลตฟอร์มที่ map ไว้กับคำอธิบาย ส่วน slug ที่มีประโยชน์น้อยสุดจะโดนซ่อนก่อน —
    // ส่วน thumbnail ที่เป็นแค่รูปประกอบไม่มีข้อมูลอะไรที่คุ้มจะเอาไปโชว์แบบ label/value เลย
    // ตัดออกจาก pop-in ไปเลย
    const columns: FioriResponsiveColumn<BrandItem>[] = [
        {
            key: 'thumbnail',
            header: t('imageLabel'),
            priority: 'low',
            hideInPopin: true,
            render: (row) => (
                <ClickableThumbnail
                    src={row.thumbnail_url}
                    alt={row.admin_label || row.code}
                    size={38}
                    radius={1.5}
                    fallback={<ImageOutlinedIcon fontSize="small" sx={{ color: 'grey.500' }} />}
                />
            ),
        },
        {
            key: 'name',
            header: (
                <TableSortLabel active={sortField === 'admin_label'} direction={sortField === 'admin_label' ? sortDir : 'asc'} onClick={() => handleSort('admin_label')}>
                    {t('name')}
                </TableSortLabel>
            ),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.admin_label || row.code}</Typography>,
        },
        {
            key: 'description',
            header: (
                <TableSortLabel active={sortField === 'description'} direction={sortField === 'description' ? sortDir : 'asc'} onClick={() => handleSort('description')}>
                    {t('description')}
                </TableSortLabel>
            ),
            priority: 'medium',
            render: (row) => (
                <Typography sx={{ color: FIORI.textSecondary, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.description || <Typography component="span" color="text.disabled">—</Typography>}
                </Typography>
            ),
        },
        {
            key: 'slug',
            header: (
                <TableSortLabel active={sortField === 'slug'} direction={sortField === 'slug' ? sortDir : 'asc'} onClick={() => handleSort('slug')}>
                    {t('slug')}
                </TableSortLabel>
            ),
            priority: 'low',
            render: (row) => (
                <Typography sx={{ color: FIORI.textSecondary }}>
                    {row.slug || <Typography component="span" color="text.disabled">—</Typography>}
                </Typography>
            ),
        },
        {
            key: 'products_count',
            header: (
                <TableSortLabel active={sortField === 'products_count'} direction={sortField === 'products_count' ? sortDir : 'asc'} onClick={() => handleSort('products_count')}>
                    {t('productsCount')}
                </TableSortLabel>
            ),
            priority: 'high',
            align: 'right',
            render: (row) =>
                row.products_count ? (
                    <Tooltip title={t('viewBrandProducts')}>
                        <Chip
                            label={row.products_count}
                            size="small"
                            onClick={() => goToProducts(row)}
                            sx={{
                                bgcolor: 'rgba(0,112,242,0.08)',
                                color: FIORI.brand,
                                fontWeight: 700,
                                cursor: 'pointer',
                                '&:hover': { bgcolor: 'rgba(0,112,242,0.16)' },
                            }}
                        />
                    </Tooltip>
                ) : (
                    <Typography color="text.disabled">0</Typography>
                ),
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: BrandItem) => (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/brands/${row.id}/edit`)}>
                                  <EditIcon fontSize="small" />
                              </IconButton>
                              {/* <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteBrandId(row.id)}>
                                  <DeleteIcon fontSize="small" />
                              </IconButton> */}
                          </Stack>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <ImagePreviewProvider>
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('brandsTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'space-between',
                        alignItems: { xs: 'stretch', sm: 'flex-start' },
                        gap: 2,
                        mb: 3,
                    }}
                >
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('brandsTitle')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25, maxWidth: 720 }}>{t('brandsIntro')}</Typography>
                    </Box>
                    {canEdit && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/brands/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {t('addNewBrand')}
                        </Button>
                    )}
                </Box>

                <Box>
                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {tGrid('results', { count: brands.total })}
                            </Typography>
                            <TextField
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={t('searchBrands')}
                                size="small"
                                sx={{ ...fioriSearchFieldSx, minWidth: 260 }}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Stack>

                        <FioriResponsiveTable
                            columns={columns}
                            rows={brands.data}
                            getRowKey={(row) => row.id}
                            emptyMessage={t('noBrandsFound')}
                        />

                        <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1.5} sx={{ mt: 2 }}>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>{tGrid('pageOf', { lastPage })}</Typography>
                            <Stack direction="row" spacing={0.2}>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                                    <FirstPageIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                                    <ChevronLeftIcon fontSize="small" />
                                </IconButton>
                                <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}>
                                    <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                                </Paper>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                                    <LastPageIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Stack>
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
                    <Button onClick={() => setDeleteBrandId(null)} sx={fioriGhostSx} disabled={deleting}>
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
                        sx={{ textTransform: 'none', borderRadius: '8px' }}
                    >
                        {deleting ? <CircularProgress size={16} color="inherit" /> : tGrid('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
        </ImagePreviewProvider>
    );
}
