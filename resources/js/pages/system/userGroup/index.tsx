import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    InputAdornment,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface PaginationData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface GridConfig {
    columns: Record<string, {
        label: string;
        type: string;
        sortable?: boolean;
    }>;
    actions?: Record<string, {
        icon: string;
        label: string;
    }>;
}

interface UserGroupIndexProps {
    gridConfig: GridConfig;
    gridData: PaginationData<any>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
}

export default function UserGroupIndex({ gridConfig, gridData, filters }: UserGroupIndexProps) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('userGroups'), href: '/system/userGroup' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('user_groups.create_user_groups');
    const canEdit = permissions.includes('user_groups.edit_user_groups');
    const canDelete = permissions.includes('user_groups.delete_user_groups');

    const [search, setSearch] = useState(filters.search || '');
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const isFirstRender = useRef(true);

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    const confirmDelete = () => {
        if (!deleteTarget) return;

        setDeleting(true);
        router.delete(`/system/userGroup/${deleteTarget.id}`, {
            preserveScroll: true,
            onFinish: () => {
                setDeleting(false);
                setDeleteTarget(null);
            },
        });
    };

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            router.get('/system/userGroup', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('userGroupsCount', { count: gridData.total })} />
            <Box sx={{ p: 4, bgcolor: 'background.default', minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2, alignItems: 'center', border: '1px solid', borderColor: 'divider', p: 1, borderRadius: 1, display: 'inline-flex' }}>
                            {tSystem('userGroupsCount', { count: gridData.total })}
                        </Typography>
                        <Box sx={{ mt: 3 }}>
                            <TextField
                                placeholder={tSystem('searchByName')}
                                variant="standard"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <SearchIcon sx={{ color: 'text.secondary' }} />
                                        </InputAdornment>
                                    ),
                                    disableUnderline: false,
                                }}
                                sx={{ minWidth: 300, '& .MuiInput-root': { pb: 1 } }}
                            />
                        </Box>
                    </Box>
                    {canCreate && (
                        <Box>
                            <Button
                                variant="contained"
                                color="primary"
                                sx={{ borderRadius: 8, px: 3, fontWeight: 'bold', color: '#fff', }}
                                onClick={() => router.visit('/system/userGroup/create')}
                            >
                                {tSystem('createUserGroup')}
                            </Button>
                        </Box>
                    )}
                </Box>

                <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 1, mt: 4 }}>
                    <Table sx={{ minWidth: 650 }}>
                        <TableHead>
                            <TableRow>
                                {Object.entries(gridConfig.columns).map(([key, column]) => (
                                    <TableCell key={key} sx={{ fontWeight: 'bold', borderBottom: '2px solid', borderColor: 'divider', backgroundColor: '#f5f5f5' }}>
                                        {t(column.label)}
                                    </TableCell>
                                ))}
                                {visibleActions.length > 0 && (
                                    <TableCell sx={{ fontWeight: 'bold', borderBottom: '2px solid', borderColor: 'divider', backgroundColor: '#f5f5f5' }}></TableCell>
                                )}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {gridData.data.map((row) => (
                                <TableRow key={row.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                    {Object.entries(gridConfig.columns).map(([key, column]) => (
                                        <TableCell key={key} sx={{ fontWeight: key === 'name' ? 600 : 400 }}>
                                            {column.type === 'boolean' ? (row[key] ? t('active') : t('inactive')) : (row[key] || '-')}
                                        </TableCell>
                                    ))}
                                    {visibleActions.length > 0 && (
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                {visibleActions.map(([actionKey, action]) => {
                                                    let Icon = EditIcon;
                                                    if (action.icon === 'copy') Icon = ContentCopyIcon;
                                                    if (action.icon === 'delete') Icon = DeleteIcon;

                                                    const handleClick = () => {
                                                        if (actionKey === 'update') {
                                                            router.visit(`/system/userGroup/${row.id}/edit`);
                                                        }
                                                        if (actionKey === 'delete') {
                                                            setDeleteTarget({ id: row.id, name: row.name });
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
                                    <TableCell colSpan={Object.keys(gridConfig.columns).length + (visibleActions.length > 0 ? 1 : 0)} align="center" sx={{ py: 3 }}>
                                        {t('noDataFound')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{tSystem('deleteGroupTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {tSystem('confirmDeleteGroupMessage', { name: deleteTarget?.name })}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button variant="outlined" color="inherit" onClick={() => setDeleteTarget(null)}>
                        {t('cancel')}
                    </Button>
                    <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleting}>
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
