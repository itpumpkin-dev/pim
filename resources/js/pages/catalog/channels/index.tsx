import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import { Box, Button, CircularProgress, Divider, InputAdornment, Paper, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Pagination } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SalesChannelSectionTabs } from '@/components/catalog/sales-channel-section-tabs';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';
import {
    FIORI,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

interface ChannelItem {
    id: number;
    code: string;
    name: string | null;
    root_category_id: number | null;
    rootCategory?: { id: number; name: string } | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    channels: PaginatedData<ChannelItem>;
    filters: { search?: string; filters?: Record<string, FilterValue> };
    filterColumns: Record<string, GridColumn>;
}

export default function ChannelIndex({ channels, filters, filterColumns }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('channels'), href: '/catalog/channels' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('channels.create_channels');
    const canEdit = permissions.includes('channels.edit_channels');
    const canDelete = permissions.includes('channels.delete_channels');

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteChannelId, setDeleteChannelId] = useState<number | null>(null);
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
            router.get('/catalog/channels', { search, filters: activeFilters }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const handlePageChange = (_: unknown, page: number) => {
        router.get('/catalog/channels', { search, page, filters: activeFilters }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/channels', { search, filters: next }, { preserveState: true });
    };

    // Column pop-in priority (SAP Fiori responsive table): the channel name
    // identifies the row and row actions stay visible down to phone width;
    // the short code follows next, then the linked root category, with the
    // raw id reflowing first since it's the least useful column at a glance.
    const columns: FioriResponsiveColumn<ChannelItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'code',
            header: t('code'),
            priority: 'high',
            render: (row) => row.code,
        },
        {
            key: 'name',
            header: t('name'),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.name || '-'}</Typography>,
        },
        {
            key: 'rootCategory',
            header: t('rootCategoryOptional'),
            priority: 'medium',
            render: (row) =>
                row.rootCategory ? (
                    <Typography variant="body2" sx={{ color: FIORI.brand, fontWeight: 500 }}>
                        {row.rootCategory.name}
                    </Typography>
                ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                        {t('noRootCategory')}
                    </Typography>
                ),
        },
        ...((canEdit || canDelete)
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: ChannelItem) => (
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              {canEdit && (
                                  <IconButton
                                      size="small"
                                      sx={fioriIconButtonSx}
                                      onClick={() => router.visit(`/catalog/channels/${row.id}/edit`)}
                                  >
                                      <EditIcon fontSize="small" />
                                  </IconButton>
                              )}
                              {canDelete && (
                                  <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteChannelId(row.id)}>
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
            <Head title={tNav('channels')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <SalesChannelSectionTabs active="channels" />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{tNav('channels')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: channels.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/channels/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {t('createChannel')}
                        </Button>
                    )}
                </Box>

                <Paper elevation={0} sx={fioriCardSx}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 2 }}>
                        <TextField
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('searchChannels')}
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
                        <Button variant="outlined" startIcon={<FilterListIcon />} onClick={() => setFilterDrawerOpen(true)} sx={fioriDefaultSx}>
                            {tGrid('filter')}
                            {Object.keys(activeFilters).length > 0 && ` (${Object.keys(activeFilters).length})`}
                        </Button>
                    </Box>

                    <Divider sx={{ borderColor: FIORI.border }} />

                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={channels.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noChannelsFound')}
                    />
                </Paper>

                {channels.last_page > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination
                            count={channels.last_page}
                            page={channels.current_page}
                            onChange={handlePageChange}
                            sx={{
                                '& .MuiPaginationItem-root': { borderRadius: '6px', color: FIORI.textPrimary },
                                '& .Mui-selected': { bgcolor: `${FIORI.brand} !important`, color: '#fff' },
                            }}
                        />
                    </Box>
                )}
            </Box>

            <Dialog open={deleteChannelId !== null} onClose={() => setDeleteChannelId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('confirmDeleteChannel')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteChannelId(null)} sx={fioriGhostSx} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteChannelId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/channels/${deleteChannelId}`, {
                                    onSuccess: () => setDeleteChannelId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
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
