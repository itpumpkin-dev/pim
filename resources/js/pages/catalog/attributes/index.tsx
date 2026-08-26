import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
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
    Menu,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/hooks/use-locale';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue, type GridColumn as FilterableGridColumn } from '@/components/grid-filter-drawer';
import { encodeQueryParams } from '@/lib/query-string';
import {
    FIORI,
    FioriBusyOverlay,
    FioriStatus,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

interface GridColumn extends FilterableGridColumn {}
interface GridAction { icon: string; label: string; }
interface GridConfig { columns: Record<string, GridColumn>; actions?: Record<string, GridAction>; }
interface GridData { data: Array<Record<string, unknown> & { id: number }>; total: number; current_page: number; last_page: number; per_page: number; }
interface Props { gridConfig: GridConfig; gridData: GridData; filters: { search?: string; sort?: string; dir?: string; filters?: Record<string, FilterValue> }; }

function cellValue(value: unknown, type: string, t: (key: string) => string) {
    if (type === 'boolean') return <FioriStatus label={value ? t('yes') : t('no')} tone={value ? 'success' : 'neutral'} />;
    if (type === 'datetime' && typeof value === 'string') return new Date(value).toLocaleDateString();
    return String(value ?? '-');
}

export default function AttributeIndex({ gridConfig, gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { locale } = useLocale();
    const breadcrumbs: BreadcrumbItem[] = [{ title: tNav('catalog'), href: '#' }, { title: tNav('attributes'), href: '/catalog/attributes' }];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attributes.create_attributes');
    const canEdit = permissions.includes('attributes.edit_attributes');
    const canDelete = permissions.includes('attributes.delete_attributes');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(gridData.per_page ?? 10);
    const [deleteAttributeId, setDeleteAttributeId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
    // ตัวนี้ควบคุม Busy State ของตาราง (FioriBusyOverlay) ระหว่างที่มี request
    // ค้นหา/เรียงลำดับ/กรอง/เปลี่ยนหน้า กำลังทำงานอยู่ — เพราะ request พวกนี้เป็น visit
    // แบบ `preserveState` ซึ่ง RouteLoadingSkeleton (loading placeholder เต็มหน้าจอของแอป)
    // จะไม่แสดงให้เห็นโดยตั้งใจ ถ้าไม่มีตัวนี้ ตาราง
    // จะไม่มีอะไรบอกผู้ใช้เลยเวลา request ช้า
    const [isFetching, setIsFetching] = useState(false);
    const visitOptions = { onStart: () => setIsFetching(true), onFinish: () => setIsFetching(false) };
    const firstRender = useRef(true);

    const handleExport = (format: 'csv' | 'xlsx') => {
        // ส่ง locale ไปตรงๆ แบบนี้ดีกว่าปล่อยให้ server เดาเอาจาก session/cookie —
        // ถ้าผู้ใช้คนไหนที่โปรไฟล์ไม่มี UI locale บันทึกไว้ และคุกกี้ `locale` ก็ไม่ได้
        // แนบมากับ request นี้พอดี (เจอเคสแบบนี้จริงๆ) มันจะเงียบๆ ตกไปใช้
        // locale เริ่มต้นของแอปแทน ซึ่งไม่ตรงกับที่ผู้ใช้เห็นอยู่บนจอ
        const params = encodeQueryParams({ format, search, filters: activeFilters, locale });
        window.location.href = `/catalog/attributes/export?${params.join('&')}`;
        setExportAnchor(null);
    };

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    // ลำดับความสำคัญของคอลัมน์เวลาจอแคบ (ตาราง responsive แบบ SAP Fiori): คอลัมน์ของ
    // ตารางนี้มาจาก gridConfig ที่ฝั่ง server กำหนดมา ไม่ใช่ลิสต์ตายตัว ดังนั้นลำดับ
    // ความสำคัญเลยอิงตามลำดับคอลัมน์ — คอลัมน์แรกใช้ระบุแถวเลยตรึงไว้เสมอ สองคอลัมน์
    // ถัดมาจะโชว์ตามพื้นที่ที่เหลือ ส่วนที่เหลือจะถูกซ่อนเข้า pop-in ก่อนเป็นอันดับแรก
    // คอลัมน์ actions ก็ตรึงไว้เหมือนคอลัมน์ที่ใช้ระบุแถว เพราะตามแพทเทิร์นของ Fiori
    // ต้องกดถึงได้เสมอเช่นกัน
    type AttributeRow = GridData['data'][number];
    const columns: FioriResponsiveColumn<AttributeRow>[] = Object.entries(gridConfig.columns).map(([key, column], index) => ({
        key,
        header: t(column.label),
        priority: index === 0 ? 'always' : index === 1 ? 'high' : index === 2 ? 'medium' : 'low',
        render: (row) => cellValue(row[key], column.type, t),
    }));

    if (visibleActions.length > 0) {
        columns.push({
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {visibleActions.map(([actionKey, action]) => {
                        let Icon = EditIcon;
                        if (action.icon === 'delete') Icon = DeleteIcon;

                        const handleClick = () => {
                            if (actionKey === 'update') {
                                router.visit(`/catalog/attributes/${row.id}/edit`);
                            } else if (actionKey === 'delete') {
                                setDeleteAttributeId(row.id);
                            }
                        };

                        return (
                            <IconButton key={actionKey} size="small" sx={{ ...fioriIconButtonSx, display: 'flex', flexDirection: 'column' }} onClick={handleClick}>
                                <Icon fontSize="small" />
                                <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>{t(action.label)}</Typography>
                            </IconButton>
                        );
                    })}
                </Stack>
            ),
        });
    }

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(
            () => router.get('/catalog/attributes', { search, per_page: perPage, filters: activeFilters }, { preserveState: true, replace: true, ...visitOptions }),
            300,
        );
        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/attributes', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true, ...visitOptions });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/attributes', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true, ...visitOptions });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/attributes', { search, per_page: perPage, filters: next }, { preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tCatalog('attributesTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {tCatalog('attributesTitle')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5}>
                        {/* {canEdit && (
                            <Button variant="outlined" onClick={() => router.visit('/catalog/attributes/woocommerce-mapping')} sx={fioriDefaultSx}>
                                {tCatalog('woocommerceContentMapping')}
                            </Button>
                        )} */}
                        <Button
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            endIcon={<ArrowDropDownIcon />}
                            onClick={(e) => setExportAnchor(e.currentTarget)}
                            sx={fioriDefaultSx}
                        >
                            {tCatalog('quickExport')}
                        </Button>
                        <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
                            <MenuItem onClick={() => handleExport('csv')}>CSV</MenuItem>
                            <MenuItem onClick={() => handleExport('xlsx')}>XLSX</MenuItem>
                        </Menu>
                        {canCreate && (
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => router.visit('/catalog/attributes/create')}
                                sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }}
                            >
                                {tCatalog('createAttribute')}
                            </Button>
                        )}
                    </Stack>
                </Stack>

                {/* การ์ดตาราง: รวม toolbar + หัวตาราง + แถวข้อมูล ไว้บนพื้นผิว "Table" แบบ Fiori เดียวกัน */}
                <Paper elevation={0} sx={fioriCardSx}>
                    {/* แถบเครื่องมือ */}
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ p: 2 }}>
                        <TextField
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={tCatalog('searchAttributes')}
                            size="small"
                            sx={{ ...fioriSearchFieldSx, minWidth: 280 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
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

                    <FioriBusyOverlay busy={isFetching}>
                        <FioriResponsiveTable
                            variant="plain"
                            columns={columns}
                            rows={gridData.data}
                            getRowKey={(row) => row.id}
                            emptyMessage={tCatalog('noAttributesFound')}
                        />
                    </FioriBusyOverlay>
                </Paper>
            </Box>
            <Dialog open={deleteAttributeId !== null} onClose={() => setDeleteAttributeId(null)}>
                <DialogTitle>{t('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {tCatalog('confirmDeleteAttributeMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteAttributeId(null)} color="inherit" sx={{ textTransform: 'none' }} disabled={deleting}>{t('cancel')}</Button>
                    <Button onClick={() => {
                        if (deleteAttributeId !== null) {
                            setDeleting(true);
                            router.delete(`/catalog/attributes/${deleteAttributeId}`, {
                                onSuccess: () => setDeleteAttributeId(null),
                                onFinish: () => setDeleting(false),
                            });
                        }
                    }} color="error" variant="contained" sx={{ textTransform: 'none', borderRadius: '8px' }} disabled={deleting} startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}>
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
