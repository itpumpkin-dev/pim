import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
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
import { GridFilterDrawer, type FilterValue, type GridColumn as FilterableGridColumn } from '@/components/grid-filter-drawer';
import {
    FIORI,
    FioriStatus,
    fioriBodyCellSx,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
    fioriTableHeadCellSx,
    fioriTableHeadSx,
    fioriTableRowSx,
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
    const firstRender = useRef(true);

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(
            () => router.get('/catalog/attributes', { search, per_page: perPage, filters: activeFilters }, { preserveState: true, replace: true }),
            300,
        );
        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/attributes', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/attributes', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true });
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
                        {canEdit && (
                            <Button variant="outlined" onClick={() => router.visit('/catalog/attributes/woocommerce-mapping')} sx={fioriDefaultSx}>
                                {tCatalog('woocommerceContentMapping')}
                            </Button>
                        )}
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

                {/* Table Card: toolbar + head + rows on one Fiori "Table" surface */}
                <Paper elevation={0} sx={fioriCardSx}>
                    {/* Toolbar */}
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

                    <TableContainer>
                        <Table>
                            <TableHead sx={fioriTableHeadSx}>
                                <TableRow>
                                    {Object.entries(gridConfig.columns).map(([key, column]) => (
                                        <TableCell key={key} sx={fioriTableHeadCellSx}>{t(column.label)}</TableCell>
                                    ))}
                                    {visibleActions.length > 0 && <TableCell sx={fioriTableHeadCellSx} align="right">{t('actionsHeader')}</TableCell>}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {gridData.data.map((row) => (
                                    <TableRow key={row.id} sx={fioriTableRowSx(false)}>
                                        {Object.entries(gridConfig.columns).map(([key, column]) => (
                                            <TableCell key={key} sx={fioriBodyCellSx}>{cellValue(row[key], column.type, t)}</TableCell>
                                        ))}
                                        {visibleActions.length > 0 && (
                                            <TableCell align="right">
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
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                                {gridData.data.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={Object.keys(gridConfig.columns).length + (visibleActions.length > 0 ? 1 : 0)} align="center" sx={{ py: 4, color: FIORI.textSecondary }}>
                                            {tCatalog('noAttributesFound')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
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
