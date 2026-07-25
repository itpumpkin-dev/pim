import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Pagination } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CategoryItem {
    id: number;
    code: string;
    name: string;
    description: string | null;
    parent_id: number | null;
    parent?: CategoryItem | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
}

interface Props {
    categories: PaginatedData<CategoryItem>;
    filters: { search?: string };
}

export default function CategoryIndex({ categories, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' }
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('categories.create_categories');
    const canEdit = permissions.includes('categories.edit_categories');
    const canDelete = permissions.includes('categories.delete_categories');

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/categories', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const handlePageChange = (_: unknown, page: number) => {
        router.get('/catalog/categories', { search, page }, { preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('categories')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>{tNav('categories')}</Typography>
                        <Typography color="text.secondary">{tGrid('results', { count: categories.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            sx={{ color: "white" }}
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/categories/create')}
                        >
                            {t('createCategory')}
                        </Button>
                    )}
                </Box>

                <TextField
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('searchCategories')}
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
                                <TableCell sx={{ fontWeight: 700 }}>{t('name')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('parent')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('description')}</TableCell>
                                {(canEdit || canDelete) && <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {categories.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell>{row.code}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                                    <TableCell>
                                        {row.parent ? (
                                            <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
                                                {row.parent.name}
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                                {t('rootCategory')}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {row.description ?? '-'}
                                    </TableCell>
                                    {(canEdit || canDelete) && (
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                {canEdit && (
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => router.visit(`/catalog/categories/${row.id}/edit`)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                {canDelete && (
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => setDeleteCategoryId(row.id)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Box>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                            {categories.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        {t('noCategoriesFound')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {categories.last_page > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination
                            count={categories.last_page}
                            page={categories.current_page}
                            onChange={handlePageChange}
                            color="primary"
                        />
                    </Box>
                )}
            </Box>

            <Dialog open={deleteCategoryId !== null} onClose={() => setDeleteCategoryId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('confirmDeleteCategory')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteCategoryId(null)} color="inherit" sx={{ fontWeight: 'bold' }}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteCategoryId !== null) {
                                router.delete(`/catalog/categories/${deleteCategoryId}`, {
                                    onSuccess: () => setDeleteCategoryId(null),
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
