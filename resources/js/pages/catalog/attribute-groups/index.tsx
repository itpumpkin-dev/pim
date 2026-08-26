import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue } from '@/components/grid-filter-drawer';
import {
    FIORI,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
    filterable?: boolean;
}
interface GridAction {
    icon: string;
    label: string;
}
interface GridConfig {
    columns: Record<string, GridColumn>;
    actions?: Record<string, GridAction>;
}
interface AttributeGroupRow {
    id: number;
    code: string;
    name?: string;
    [key: string]: unknown;
}
interface GridData {
    data: AttributeGroupRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string; filters?: Record<string, FilterValue> };
}

export default function AttributeGroupIndex({ gridConfig, gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributeGroups'), href: '/catalog/attributeGroups' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attribute_groups.create_attribute_groups');
    const canEdit = permissions.includes('attribute_groups.edit_attribute_groups');
    const canDelete = permissions.includes('attribute_groups.delete_attribute_groups');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(gridData.per_page ?? 10);
    const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/attributeGroups', { search, per_page: perPage, filters: activeFilters }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/attributeGroups', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/attributeGroups', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/attributeGroups', { search, per_page: perPage, filters: next }, { preserveState: true });
    };

    // ลำดับความสำคัญของคอลัมน์เวลาจอแคบ (ตาราง responsive แบบ SAP Fiori): id คือสิ่งที่
    // มีประโยชน์น้อยสุดสำหรับคนดูบนจอแคบ เลยโดนซ่อนก่อนเป็นอันดับแรก ส่วน code
    // ใช้ระบุแถวเลยตรึงไว้ตลอด ส่วน name จะโชว์ตามพื้นที่ที่เหลือ
    // คอลัมน์ actions ก็ตรึงไว้เหมือนคอลัมน์ที่ใช้ระบุแถวเช่นกัน
    const columns: FioriResponsiveColumn<AttributeGroupRow>[] = [
        { key: 'id', header: t('fields.id'), priority: 'low', render: (row) => row.id },
        { key: 'code', header: t('fields.code'), priority: 'always', render: (row) => <Typography sx={{ fontWeight: 500 }}>{row.code}</Typography> },
        { key: 'name', header: t('fields.name'), priority: 'high', render: (row) => row.name || ucfirst(row.code) },
        {
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {canEdit && (
                        <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/attributeGroups/${row.id}/edit`)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    )}
                    {canDelete && (
                        <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteGroupId(row.id)}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    )}
                </Stack>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tCatalog('attributeGroupsTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {/* หัวข้อและปุ่มสร้างใหม่ */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {tCatalog('attributeGroupsTitle')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            variant="contained"
                            onClick={() => router.visit('/catalog/attributeGroups/create')}
                            sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }}
                        >
                            {tCatalog('createAttributeGroup')}
                        </Button>
                    )}
                </Stack>

                {/* การ์ดตาราง: รวม toolbar + หัวตาราง + แถวข้อมูล ไว้บนพื้นผิว "Table" แบบ Fiori เดียวกัน */}
                <Paper elevation={0} sx={fioriCardSx}>
                    {/* แถบเครื่องมือ */}
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ p: 2 }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tCatalog('search')}
                            size="small"
                            sx={{ ...fioriSearchFieldSx, minWidth: 240 }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                            <Button
                                variant="outlined"
                                startIcon={<FilterListIcon />}
                                onClick={() => setFilterDrawerOpen(true)}
                                sx={fioriDefaultSx}
                            >
                                {t('filter')}
                                {Object.keys(activeFilters).length > 0 && ` (${Object.keys(activeFilters).length})`}
                            </Button>

                            <Select
                                value={perPage}
                                onChange={(e) => handlePerPageChange(Number(e.target.value))}
                                size="small"
                                sx={{
                                    bgcolor: FIORI.surface,
                                    borderRadius: '8px',
                                    minWidth: 60,
                                    height: 34,
                                    '& .MuiOutlinedInput-notchedOutline': { borderColor: FIORI.border },
                                }}
                            >
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={25}>25</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                            </Select>

                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {t('perPage')}
                            </Typography>

                            <Paper
                                variant="outlined"
                                sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}
                            >
                                <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                            </Paper>

                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {t('pageOf', { lastPage })}
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

                    {/* ตาราง */}
                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={tCatalog('noAttributeGroupsFound')}
                    />
                </Paper>
            </Box>

            {/* ไดอะล็อกยืนยันการลบ */}
            <Dialog open={deleteGroupId !== null} onClose={() => setDeleteGroupId(null)}>
                <DialogTitle>{t('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {tCatalog('confirmDeleteAttributeGroupMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteGroupId(null)} color="inherit" disabled={deleting} sx={{ textTransform: 'none' }}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteGroupId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/attributeGroups/${deleteGroupId}`, {
                                    onSuccess: () => setDeleteGroupId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ textTransform: 'none', borderRadius: '8px' }}
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
            <GridFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                columns={gridConfig.columns}
                value={activeFilters}
                onApply={applyFilters}
                t={t}
            />
        </AppLayout>
    );
}

function ucfirst(str: string) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
