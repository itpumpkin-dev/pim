import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Pagination, Chip } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/hooks/use-locale';

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
    filters: { search?: string };
}

export default function CategoryFieldIndex({ fields, filters }: Props) {
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
    const [deleteFieldId, setDeleteFieldId] = useState<number | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/categoryFields', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const handlePageChange = (_: unknown, page: number) => {
        router.get('/catalog/categoryFields', { search, page }, { preserveState: true });
    };

    const getFieldLabel = (item: CategoryFieldItem) => {
        const activeLocale = locales.find((l) => l.code === currentLocaleCode);
        if (activeLocale && item.labels[activeLocale.id]) {
            return item.labels[activeLocale.id];
        }
        // Fallback to first label
        return Object.values(item.labels)[0] || item.code;
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('categoryFields')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>{tNav('categoryFields')}</Typography>
                        <Typography color="text.secondary">{tGrid('results', { count: fields.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            sx={{ color: "white" }}
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/categoryFields/create')}
                        >
                            Create Field
                        </Button>
                    )}
                </Box>

                <TextField
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search fields..."
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
                                <TableCell sx={{ fontWeight: 700 }}>{t('code')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Label</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('type')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Required</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Position</TableCell>
                                {(canEdit || canDelete) && <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {fields.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell>{row.code}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{getFieldLabel(row)}</TableCell>
                                    <TableCell>
                                        <Chip label={row.type} size="small" variant="outlined" color="primary" />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={row.is_required ? 'Yes' : 'No'}
                                            size="small"
                                            color={row.is_required ? 'secondary' : 'default'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={row.status ? 'Active' : 'Inactive'}
                                            size="small"
                                            color={row.status ? 'success' : 'warning'}
                                        />
                                    </TableCell>
                                    <TableCell>{row.position}</TableCell>
                                    {(canEdit || canDelete) && (
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                {canEdit && (
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => router.visit(`/catalog/categoryFields/${row.id}/edit`)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                {canDelete && (
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => setDeleteFieldId(row.id)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Box>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                            {fields.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={8} align="center">
                                        No category fields found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {fields.total > fields.per_page && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination
                            count={Math.ceil(fields.total / fields.per_page)}
                            page={fields.current_page}
                            onChange={handlePageChange}
                            color="primary"
                        />
                    </Box>
                )}
            </Box>

            <Dialog open={deleteFieldId !== null} onClose={() => setDeleteFieldId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this category field?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteFieldId(null)} color="inherit" sx={{ fontWeight: 'bold' }}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteFieldId !== null) {
                                router.delete(`/catalog/categoryFields/${deleteFieldId}`, {
                                    onSuccess: () => setDeleteFieldId(null),
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
        </AppLayout>
    );
}
