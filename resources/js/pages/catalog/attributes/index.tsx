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
import { Box, Button, Chip, CircularProgress, colors, InputAdornment, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GridFilterDrawer, type FilterValue, type GridColumn as FilterableGridColumn } from '@/components/grid-filter-drawer';

interface GridColumn extends FilterableGridColumn {}
interface GridAction { icon: string; label: string; }
interface GridConfig { columns: Record<string, GridColumn>; actions?: Record<string, GridAction>; }
interface GridData { data: Array<Record<string, unknown> & { id: number }>; total: number; current_page: number; last_page: number; per_page: number; }
interface Props { gridConfig: GridConfig; gridData: GridData; filters: { search?: string; sort?: string; dir?: string; filters?: Record<string, FilterValue> }; }

function cellValue(value: unknown, type: string, t: (key: string) => string) {
    if (type === 'boolean') return <Chip label={value ? t('yes') : t('no')} size="small" color={value ? 'primary' : 'default'} variant={value ? 'filled' : 'outlined'} />;
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

    return <AppLayout
        breadcrumbs={breadcrumbs}>
        <Head title={tCatalog('attributesTitle')} />
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                <Box><Typography variant="h4" fontWeight={700}>{tCatalog('attributesTitle')}</Typography>
                    <Typography color="text.secondary">{t('results', { count: gridData.total })}</Typography>
                </Box>
                <Stack direction="row" spacing={1.5}>
                    {canEdit &&
                        <Button variant="outlined" onClick={() => router.visit('/catalog/attributes/woocommerce-mapping')}>{tCatalog('woocommerceContentMapping')}</Button>}
                    {canCreate &&
                        <Button sx={{ color: "white" }} variant="contained" startIcon={<AddIcon />} onClick={() => router.visit('/catalog/attributes/create')}>{tCatalog('createAttribute')}</Button>}
                </Stack>
            </Box>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tCatalog('searchAttributes')} size="small" sx={{ minWidth: 280 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />

                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Button
                        variant="outlined"
                        startIcon={<FilterListIcon />}
                        onClick={() => setFilterDrawerOpen(true)}
                        sx={{
                            color: '#64748b',
                            borderColor: '#cbd5e1',
                            textTransform: 'none',
                            borderRadius: 1.5,
                            bgcolor: '#fff',
                        }}
                    >
                        {t('filter')}
                        {Object.keys(activeFilters).length > 0 && ` (${Object.keys(activeFilters).length})`}
                    </Button>
                    <Select
                        value={perPage}
                        onChange={(e) => handlePerPageChange(Number(e.target.value))}
                        size="small"
                        sx={{ minWidth: 60, height: 36 }}
                    >
                        <MenuItem value={10}>10</MenuItem>
                        <MenuItem value={25}>25</MenuItem>
                        <MenuItem value={50}>50</MenuItem>
                    </Select>
                    <Typography variant="body2" color="text.secondary">
                        {t('perPage')}
                    </Typography>

                    <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body2">{currentPage}</Typography>
                    </Paper>

                    <Typography variant="body2" color="text.secondary">
                        {t('pageOf', { lastPage })}
                    </Typography>

                    <Stack direction="row" spacing={0.2}>
                        <IconButton size="small" disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                            <FirstPageIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                            <ChevronLeftIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                            <ChevronRightIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                            <LastPageIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Stack>
            </Stack>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            {Object.entries(gridConfig.columns).map(([key, column]) => (
                                <TableCell key={key} sx={{ fontWeight: 700 }}>{t(column.label)}</TableCell>
                            ))}
                            {visibleActions.length > 0 && <TableCell sx={{ fontWeight: 700 }} align="right">{t('actionsHeader')}</TableCell>}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {gridData.data.map((row) => (
                            <TableRow key={row.id}>
                                {Object.entries(gridConfig.columns).map(([key, column]) => (
                                    <TableCell key={key}>{cellValue(row[key], column.type, t)}</TableCell>
                                ))}
                                {visibleActions.length > 0 && (
                                    <TableCell align="right">
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
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
                                                    <IconButton key={actionKey} size="small" sx={{ display: 'flex', flexDirection: 'column' }} onClick={handleClick}>
                                                        <Icon fontSize="small" />
                                                        <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>{t(action.label)}</Typography>
                                                    </IconButton>
                                                );
                                            })}
                                        </Box>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                        {gridData.data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={Object.keys(gridConfig.columns).length + (visibleActions.length > 0 ? 1 : 0)} align="center">
                                    {tCatalog('noAttributesFound')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
        <Dialog open={deleteAttributeId !== null} onClose={() => setDeleteAttributeId(null)}>
            <DialogTitle>{t('confirmDeletion')}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {tCatalog('confirmDeleteAttributeMessage')}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDeleteAttributeId(null)} color="inherit" sx={{ fontWeight: 'bold' }} disabled={deleting}>{t('cancel')}</Button>
                <Button onClick={() => {
                    if (deleteAttributeId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/attributes/${deleteAttributeId}`, {
                            onSuccess: () => setDeleteAttributeId(null),
                            onFinish: () => setDeleting(false),
                        });
                    }
                }} color="error" variant="contained" sx={{ fontWeight: 'bold' }} disabled={deleting} startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}>
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
    </AppLayout >;
}

