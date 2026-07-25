import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Box, Button, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Pagination } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('exportsTitle')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>{t('exportsTitle')}</Typography>
                        <Typography color="text.secondary">{tGrid('results', { count: configs.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            sx={{ color: 'white' }}
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/import-export/exports/create')}
                        >
                            {t('createExport')}
                        </Button>
                    )}
                </Box>

                <TextField
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('searchExports')}
                    size="small"
                    sx={{ mb: 3, minWidth: 280 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />

                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('typeLabel')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {configs.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{row.code}</TableCell>
                                    <TableCell>{typeLabel(row.type)}</TableCell>
                                    <TableCell align="right">
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                            {canRun && (
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    title={t('exportNow')}
                                                    onClick={() => router.post(`/import-export/exports/${row.id}/run`)}
                                                >
                                                    <PlayArrowIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                            {canEdit && (
                                                <IconButton size="small" onClick={() => router.visit(`/import-export/exports/${row.id}/edit`)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                            {canDelete && (
                                                <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {configs.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} align="center">{t('noExportsFound')}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {configs.last_page > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination count={configs.last_page} page={configs.current_page} onChange={handlePageChange} color="primary" />
                    </Box>
                )}
            </Box>

            <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('confirmDeleteExport')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} color="inherit" sx={{ fontWeight: 'bold' }}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                router.delete(`/import-export/exports/${deleteId}`, { onSuccess: () => setDeleteId(null) });
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
        </AppLayout>
    );
}
