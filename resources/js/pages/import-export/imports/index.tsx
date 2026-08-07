import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Box, Button, CircularProgress, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Pagination, Chip } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ImportConfigItem {
    id: number;
    code: string;
    type: string;
    action: string;
    source_file_path: string | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    configs: PaginatedData<ImportConfigItem>;
    filters: { search?: string };
}

export default function ImportIndex({ configs, filters }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('importsTitle'), href: '/import-export/imports' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('import_configs.create_import_configs');
    const canEdit = permissions.includes('import_configs.edit_import_configs');
    const canDelete = permissions.includes('import_configs.delete_import_configs');
    const canRun = permissions.includes('import_configs.edit_import_configs');

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
            router.get('/import-export/imports', { search }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
    }, [search]);

    const handlePageChange = (_: unknown, page: number) => {
        router.get('/import-export/imports', { search, page }, { preserveState: true });
    };

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('importsTitle')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>{t('importsTitle')}</Typography>
                        <Typography color="text.secondary">{tGrid('results', { count: configs.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            sx={{ color: 'white' }}
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/import-export/imports/create')}
                        >
                            {t('createImport')}
                        </Button>
                    )}
                </Box>

                <TextField
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('searchImports')}
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
                                <TableCell sx={{ fontWeight: 700 }}>{t('action')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('uploadedFile')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {configs.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{row.code}</TableCell>
                                    <TableCell>{typeLabel(row.type)}</TableCell>
                                    <TableCell>{row.action === 'delete' ? t('actionDelete') : t('actionCreateUpdate')}</TableCell>
                                    <TableCell>
                                        {row.source_file_path ? (
                                            <Chip label={row.source_file_path.split('/').pop()} size="small" />
                                        ) : (
                                            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                                {t('noFileUploaded')}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                            {canRun && row.source_file_path && (
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    title={t('importNow')}
                                                    disabled={runningId === row.id}
                                                    onClick={() => {
                                                        setRunningId(row.id);
                                                        router.post(`/import-export/imports/${row.id}/run`, {}, {
                                                            onFinish: () => setRunningId(null),
                                                        });
                                                    }}
                                                >
                                                    {runningId === row.id ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon fontSize="small" />}
                                                </IconButton>
                                            )}
                                            {canEdit && (
                                                <IconButton size="small" onClick={() => router.visit(`/import-export/imports/${row.id}/edit`)}>
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
                                    <TableCell colSpan={6} align="center">{t('noImportsFound')}</TableCell>
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
                    <DialogContentText>{t('confirmDeleteImport')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} color="inherit" sx={{ fontWeight: 'bold' }} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                setDeleting(true);
                                router.delete(`/import-export/imports/${deleteId}`, {
                                    onSuccess: () => setDeleteId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        sx={{ fontWeight: 'bold' }}
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
