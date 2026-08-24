import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FilterListIcon from '@mui/icons-material/FilterList';
import { Box, Button, CircularProgress, InputAdornment, MenuItem, Paper, Select, Stack, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/hooks/use-locale';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';
import {
    FIORI,
    FioriStatus,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

interface CategoryFieldItem {
    id: number;
    code: string;
    type: string;
    labels: Record<string, string>;
    is_required: boolean;
    status: boolean;
    position: number;
    display_section: string | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    fields: PaginatedData<CategoryFieldItem>;
    filters: { search?: string; filters?: Record<string, FilterValue> };
    filterColumns: Record<string, GridColumn>;
}

export default function CategoryFieldIndex({ fields, filters, filterColumns }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');
    const { locales, locale: currentLocaleCode } = useLocale();

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categoryFields'), href: '/catalog/categoryFields' }
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('category_fields.create_category_fields');
    const canEdit = permissions.includes('category_fields.edit_category_fields');
    const canDelete = permissions.includes('category_fields.delete_category_fields');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(fields.per_page ?? 15);
    const [deleteFieldId, setDeleteFieldId] = useState<number | null>(null);
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
            router.get('/catalog/categoryFields', { search, per_page: perPage, filters: activeFilters }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = fields.current_page ?? 1;
    const lastPage = fields.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/categoryFields', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categoryFields', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/categoryFields', { search, per_page: perPage, filters: next }, { preserveState: true });
    };

    const getFieldLabel = (item: CategoryFieldItem) => {
        const activeLocale = locales.find((l) => l.code === currentLocaleCode);
        if (activeLocale && item.labels[activeLocale.id]) {
            return item.labels[activeLocale.id];
        }
        // Fallback to first label
        return Object.values(item.labels)[0] || item.code;
    };

    // Column pop-in priority (SAP Fiori responsive table): the field label
    // identifies the row and row actions stay visible down to phone width;
    // Status is the next most useful thing to scan for, then the code/type,
    // with id/required/position reflowing first as the least useful columns
    // at a glance.
    const columns: FioriResponsiveColumn<CategoryFieldItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'code',
            header: t('code'),
            priority: 'medium',
            render: (row) => row.code,
        },
        {
            key: 'label',
            header: 'Label',
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{getFieldLabel(row)}</Typography>,
        },
        {
            key: 'type',
            header: t('type'),
            priority: 'medium',
            render: (row) => <FioriStatus label={row.type} tone="information" />,
        },
        {
            key: 'required',
            header: 'Required',
            priority: 'low',
            render: (row) => <FioriStatus label={row.is_required ? 'Yes' : 'No'} tone={row.is_required ? 'information' : 'neutral'} />,
        },
        {
            key: 'status',
            header: 'Status',
            priority: 'high',
            render: (row) => <FioriStatus label={row.status ? 'Active' : 'Inactive'} tone={row.status ? 'success' : 'neutral'} />,
        },
        {
            key: 'position',
            header: 'Position',
            priority: 'low',
            render: (row) => row.position,
        },
        ...((canEdit || canDelete)
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: CategoryFieldItem) => (
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                              {canEdit && (
                                  <IconButton
                                      size="small"
                                      sx={fioriIconButtonSx}
                                      onClick={() => router.visit(`/catalog/categoryFields/${row.id}/edit`)}
                                  >
                                      <EditIcon fontSize="small" />
                                  </IconButton>
                              )}
                              {canDelete && (
                                  <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteFieldId(row.id)}>
                                      <DeleteIcon fontSize="small" />
                                  </IconButton>
                              )}
                          </Box>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('categoryFields')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{tNav('categoryFields')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: fields.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/categoryFields/create')}
                            sx={fioriEmphasizedSx}
                        >
                            Create Field
                        </Button>
                    )}
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                    <TextField
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search fields..."
                        size="small"
                        sx={{ ...fioriSearchFieldSx, minWidth: 280 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: FIORI.textSecondary }} />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Button
                            variant="outlined"
                            startIcon={<FilterListIcon />}
                            onClick={() => setFilterDrawerOpen(true)}
                            sx={fioriDefaultSx}
                        >
                            {tGrid('filter')}
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
                            <MenuItem value={15}>15</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                        </Select>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {tGrid('perPage')}
                        </Typography>

                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                        </Paper>

                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {tGrid('pageOf', { lastPage })}
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

                <FioriResponsiveTable
                    columns={columns}
                    rows={fields.data}
                    getRowKey={(row) => row.id}
                    emptyMessage="No category fields found."
                />
            </Box>

            <Dialog open={deleteFieldId !== null} onClose={() => setDeleteFieldId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this category field?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteFieldId(null)} sx={fioriGhostSx} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteFieldId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/categoryFields/${deleteFieldId}`, {
                                    onSuccess: () => setDeleteFieldId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 700 }}
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        {tGrid('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
            <GridFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                columns={filterColumns}
                value={activeFilters}
                onApply={applyFilters}
                t={t}
            />
        </AppLayout>
    );
}
