import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import { Box, Button, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Pagination, Tab, Tabs } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';

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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('channels')} />
            <Box sx={{ p: 4 }}>
                <Tabs
                    value="channels"
                    onChange={(_, val) => router.visit(val === 'platforms' ? '/catalog/sales-platforms' : '/catalog/channels')}
                    sx={{ mb: 3 }}
                >
                    <Tab value="channels" label={t('channelsTab')} />
                    <Tab value="platforms" label={t('salesPlatformsTab')} />
                </Tabs>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>{tNav('channels')}</Typography>
                        <Typography color="text.secondary">{tGrid('results', { count: channels.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            sx={{ color: 'white' }}
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/channels/create')}
                        >
                            {t('createChannel')}
                        </Button>
                    )}
                </Box>

                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3 }}>
                    <TextField
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('searchChannels')}
                        size="small"
                        sx={{ minWidth: 280 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <Button variant="outlined" startIcon={<FilterListIcon />} onClick={() => setFilterDrawerOpen(true)}>
                        {tGrid('filter')}
                        {Object.keys(activeFilters).length > 0 && ` (${Object.keys(activeFilters).length})`}
                    </Button>
                </Box>

                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('code')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('name')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('rootCategoryOptional')}</TableCell>
                                {(canEdit || canDelete) && <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {channels.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell>{row.code}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{row.name || '-'}</TableCell>
                                    <TableCell>
                                        {row.rootCategory ? (
                                            <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
                                                {row.rootCategory.name}
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                                {t('noRootCategory')}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    {(canEdit || canDelete) && (
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                {canEdit && (
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => router.visit(`/catalog/channels/${row.id}/edit`)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                {canDelete && (
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => setDeleteChannelId(row.id)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Box>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                            {channels.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center">
                                        {t('noChannelsFound')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {channels.last_page > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination
                            count={channels.last_page}
                            page={channels.current_page}
                            onChange={handlePageChange}
                            color="primary"
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
                    <Button onClick={() => setDeleteChannelId(null)} color="inherit" sx={{ fontWeight: 'bold' }}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteChannelId !== null) {
                                router.delete(`/catalog/channels/${deleteChannelId}`, {
                                    onSuccess: () => setDeleteChannelId(null),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        sx={{ fontWeight: 'bold' }}
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
