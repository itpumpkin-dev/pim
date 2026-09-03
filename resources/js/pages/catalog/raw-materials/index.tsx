import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import SearchIcon from '@mui/icons-material/Search';
import {
    Box,
    Button,
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
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriFormGroup } from '@/components/fiori-form';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ProductPicker, type ProductOption } from '@/components/product-picker';
import { FIORI, fioriEmphasizedSx, fioriGhostSx, fioriIconButtonSx, fioriNegativeSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface RawMaterialItem {
    id: number;
    sku: string;
    name: string;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    products: PaginatedData<RawMaterialItem>;
    filters: { search?: string };
}

/**
 * "วัตถุดิบ" (Raw Material / RM) master — ไม่ใช่หน้าจอสร้างสินค้าใหม่ แค่หน้า
 * สำหรับติ๊กว่าสินค้าที่มีอยู่แล้วในระบบตัวไหนใช้เป็นวัตถุดิบได้บ้าง
 * (products.is_raw_material — ดู RawMaterialController) รายการที่เลือกไว้ที่นี่
 * จะเป็นตัวเลือกส่วนประกอบของ BOM (ดู catalog/bom/edit.tsx)
 */
export default function RawMaterialIndex({ products, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('raw_materials.edit_raw_materials');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('rawMaterials'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [removeId, setRemoveId] = useState<number | null>(null);
    const [removing, setRemoving] = useState(false);
    const [picked, setPicked] = useState<ProductOption[]>([]);
    const [adding, setAdding] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/raw-materials', { search }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = products.current_page ?? 1;
    const lastPage = products.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/raw-materials', { search, page }, { preserveState: true });

    const addPicked = () => {
        if (picked.length === 0) return;
        setAdding(true);
        router.post(
            '/catalog/raw-materials',
            { product_ids: picked.map((p) => p.id) },
            {
                preserveScroll: true,
                onSuccess: () => setPicked([]),
                onFinish: () => setAdding(false),
            },
        );
    };

    const columns: FioriResponsiveColumn<RawMaterialItem>[] = [
        {
            key: 'sku',
            header: 'SKU',
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.sku}</Typography>,
        },
        {
            key: 'name',
            header: t('rawMaterialNameColumn'),
            priority: 'always',
            render: (row) => <Typography sx={{ color: FIORI.textSecondary }}>{row.name}</Typography>,
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: RawMaterialItem) => (
                          <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setRemoveId(row.id)}>
                              <DeleteIcon fontSize="small" />
                          </IconButton>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('rawMaterials')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{tNav('rawMaterials')}</Typography>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: products.total })}</Typography>
                </Box>

                {canEdit && (
                    <FioriFormGroup title={t('rawMaterialAddTitle')} description={t('rawMaterialAddHelperText')} sx={{ mb: 3 }}>
                        <ProductPicker value={picked} onChange={setPicked} />
                        <Box>
                            <Button
                                variant="contained"
                                disabled={picked.length === 0 || adding}
                                startIcon={adding ? <CircularProgress size={16} color="inherit" /> : undefined}
                                onClick={addPicked}
                                sx={fioriEmphasizedSx}
                            >
                                {adding ? t('saving') : t('rawMaterialAddButton')}
                            </Button>
                        </Box>
                    </FioriFormGroup>
                )}

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="flex-end" sx={{ mb: 2 }}>
                    <TextField
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('rawMaterialSearchPlaceholder')}
                        size="small"
                        sx={{ ...fioriSearchFieldSx, width: { xs: '100%', md: 'auto' }, minWidth: { xs: 0, md: 260 } }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                </Stack>

                <FioriResponsiveTable columns={columns} rows={products.data} getRowKey={(row) => row.id} emptyMessage={t('noRawMaterialsFound')} />

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

            <Dialog open={removeId !== null} onClose={() => setRemoveId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('confirmRemoveRawMaterial')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRemoveId(null)} sx={fioriGhostSx} disabled={removing}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (removeId !== null) {
                                setRemoving(true);
                                router.delete(`/catalog/raw-materials/${removeId}`, {
                                    preserveScroll: true,
                                    onSuccess: () => setRemoveId(null),
                                    onFinish: () => setRemoving(false),
                                });
                            }
                        }}
                        variant="outlined"
                        disabled={removing}
                        sx={fioriNegativeSx}
                    >
                        {removing ? <CircularProgress size={16} color="inherit" /> : tGrid('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
