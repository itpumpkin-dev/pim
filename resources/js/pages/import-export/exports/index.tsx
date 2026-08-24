import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Box, Button, CircularProgress, Divider, InputAdornment, Paper, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Pagination } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import {
    FIORI,
    fioriCardSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

interface ExportConfigItem {
    id: number;
    code: string;
    type: string;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    configs: PaginatedData<ExportConfigItem>;
    filters: { search?: string };
}

export default function ExportIndex({ configs, filters }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('exportsTitle'), href: '/import-export/exports' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('export_configs.create_export_configs');
    const canEdit = permissions.includes('export_configs.edit_export_configs');
    const canDelete = permissions.includes('export_configs.delete_export_configs');
    const canRun = permissions.includes('export_configs.edit_export_configs');

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [runningId, setRunningId] = useState<number | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/import-export/exports', { search }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
    }, [search]);

    const handlePageChange = (_: unknown, page: number) => {
        router.get('/import-export/exports', { search, page }, { preserveState: true });
    };

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    // Column pop-in priority (SAP Fiori responsive table): the config code
    // is the identifying column and stays visible at every width; the type
    // is secondary metadata that reflows into the pop-in area first, and the
    // numeric ID is the least useful on a phone. Row actions stay pinned
    // like the identifying column.
    const columns: FioriResponsiveColumn<ExportConfigItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'code',
            header: 'Code',
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.code}</Typography>,
        },
        {
            key: 'type',
            header: t('typeLabel'),
            priority: 'medium',
            render: (row) => typeLabel(row.type),
        },
        {
            key: 'actions',
            header: tGrid('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                    {canRun && (
                        <IconButton
                            size="small"
                            sx={fioriIconButtonSx}
                            title={t('exportNow')}
                            disabled={runningId === row.id}
                            onClick={() => {
                                setRunningId(row.id);
                                router.post(`/import-export/exports/${row.id}/run`, {}, {
                                    onFinish: () => setRunningId(null),
                                });
                            }}
                        >
                            {runningId === row.id ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon fontSize="small" />}
                        </IconButton>
                    )}
                    {canEdit && (
                        <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/import-export/exports/${row.id}/edit`)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    )}
                    {canDelete && (
                        <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteId(row.id)}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    )}
                </Box>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('exportsTitle')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('exportsTitle')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: configs.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/import-export/exports/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {t('createExport')}
                        </Button>
                    )}
                </Box>

                <Paper elevation={0} sx={fioriCardSx}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 2 }}>
                        <TextField
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('searchExports')}
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
                    </Box>

                    <Divider sx={{ borderColor: FIORI.border }} />

                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={configs.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noExportsFound')}
                    />
                </Paper>

                {configs.last_page > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination
                            count={configs.last_page}
                            page={configs.current_page}
                            onChange={handlePageChange}
                            sx={{
                                '& .MuiPaginationItem-root': { borderRadius: '6px', color: FIORI.textPrimary },
                                '& .Mui-selected': { bgcolor: `${FIORI.brand} !important`, color: '#fff' },
                            }}
                        />
                    </Box>
                )}
            </Box>

            <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('confirmDeleteExport')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} sx={fioriGhostSx} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                setDeleting(true);
                                router.delete(`/import-export/exports/${deleteId}`, {
                                    onSuccess: () => setDeleteId(null),
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
        </AppLayout>
    );
}
