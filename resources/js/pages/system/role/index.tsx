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

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'USER ROLES',
        href: '/system/roles',
    },
];

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

interface RoleIndexProps {
    gridConfig: GridConfig;
    gridData: PaginationData<any>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
}

export default function RoleIndex({ gridConfig, gridData, filters }: RoleIndexProps) {
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('roles.create_roles');
    const canEdit = permissions.includes('roles.edit_roles');
    const canDelete = permissions.includes('roles.delete_roles');

    const [search, setSearch] = useState(filters.search || '');
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
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
        router.delete(`/system/roles/${deleteTarget.id}`, {
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
            router.get('/system/roles', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="System User Roles" />
            <Box sx={{ p: 4, bgcolor: 'background.default', minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2, display: 'inline-block', border: '1px solid', borderColor: 'divider', p: 1, borderRadius: 1 }}>
                            {gridData.total} roles
                        </Typography>
                        <Box sx={{ mt: 3 }}>
                            <TextField
                                placeholder="Search by Name"
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
                                sx={{ borderRadius: 8, px: 3, fontWeight: 'bold' }}
                                onClick={() => router.visit('/system/roles/create')}
                            >
                                CREATE ROLE
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
                                        {column.label}
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
                                        <TableCell key={key} sx={{ fontWeight: key === 'label' ? 600 : 400 }}>
                                            {column.type === 'boolean' ? (row[key] ? 'Active' : 'Inactive') : (row[key] || '-')}
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
                                                            router.visit(`/system/roles/${row.id}/edit`);
                                                        }
                                                        if (actionKey === 'delete') {
                                                            setDeleteTarget({ id: row.id, label: row.label });
                                                        }
                                                    };

                                                    return (
                                                        <IconButton key={actionKey} size="small" sx={{ display: 'flex', flexDirection: 'column' }} onClick={handleClick}>
                                                            <Icon fontSize="small" />
                                                            <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>{action.label}</Typography>
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
                                        No data found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Delete role?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete the role "{deleteTarget?.label}"? This will remove it from every user it is assigned to and
                        cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button variant="outlined" color="inherit" onClick={() => setDeleteTarget(null)}>
                        Cancel
                    </Button>
                    <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleting}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
