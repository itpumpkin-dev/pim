import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Box, Button, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import { useState, useEffect, useRef } from 'react';
import CreateUserDialog from '@/components/system/create-user-dialog';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'SYSTEM',
        href: '#',
    },
    {
        title: 'USERS',
        href: '/system/user',
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

interface UserIndexProps {
    gridConfig: GridConfig;
    gridData: PaginationData<any>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
}

export default function UserIndex({ gridConfig, gridData, filters }: UserIndexProps) {
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('users.create_users');
    const canEdit = permissions.includes('users.edit_users');
    const canDelete = permissions.includes('users.delete_users');

    const [search, setSearch] = useState(filters.search || '');
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
    const isFirstRender = useRef(true);

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const delayDebounceFn = setTimeout(() => {
            router.get('/system/user', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="System Users" />
            <Box sx={{ p: 4, bgcolor: 'background.default', minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center' }}>
                            {gridData.total} users
                        </Typography>
                        <TextField
                            placeholder="Search by Username"
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
                    {canCreate && (
                        <Box>
                            <Button variant="contained" color="primary" sx={{ borderRadius: 8, px: 3, fontWeight: 'bold' }} onClick={() => setCreateOpen(true)}>
                                CREATE USER
                            </Button>
                        </Box>
                    )}
                </Box>

                <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />

                <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 3 }}>
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
                                        <TableCell key={key} sx={{ fontWeight: key === 'employee_id' || key === 'username' ? 600 : 400 }}>
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
                                                            router.visit(`/system/user/${row.id}/edit`);
                                                        } else if (actionKey === 'delete') {
                                                            setDeleteUserId(row.id as number);
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
        <Dialog open={deleteUserId !== null} onClose={() => setDeleteUserId(null)}>
            <DialogTitle>Confirm deletion</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    Are you sure you want to delete this user?
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDeleteUserId(null)} color="inherit" sx={{ fontWeight: 'bold' }}>Cancel</Button>
                <Button onClick={() => {
                    if (deleteUserId !== null) {
                        router.delete(`/system/user/${deleteUserId}`, {
                            onSuccess: () => setDeleteUserId(null),
                        });
                    }
                }} color="error" variant="contained" sx={{ fontWeight: 'bold' }}>
                    Delete
                </Button>
            </DialogActions>
        </Dialog>
        </AppLayout>
    );
}
