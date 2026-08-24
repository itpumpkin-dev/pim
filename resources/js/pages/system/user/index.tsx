import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Box, Button, CircularProgress, InputAdornment, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CreateUserDialog from '@/components/system/create-user-dialog';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import {
    FIORI,
    FioriStatus,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

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

interface DepartmentOption {
    id: number;
    name: string;
}

interface JobPositionOption {
    id: number;
    name: string;
}

interface UserIndexProps {
    gridConfig: GridConfig;
    gridData: PaginationData<any>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
    departments: DepartmentOption[];
    jobPositions: JobPositionOption[];
}

export default function UserIndex({ gridConfig, gridData, filters, departments, jobPositions }: UserIndexProps) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('users'), href: '/system/user' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('users.create_users');
    const canEdit = permissions.includes('users.edit_users');
    const canDelete = permissions.includes('users.delete_users');

    const [search, setSearch] = useState(filters.search || '');
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
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

    // Column pop-in priority (SAP Fiori responsive table): columns come from
    // the server-driven gridConfig, so priority falls out of column order —
    // the first (identifying) columns stay visible longest, less essential
    // columns reflow into the pop-in area first. Row actions stay pinned
    // like the identifying columns.
    type UserRow = UserIndexProps['gridData']['data'][number];
    const columns: FioriResponsiveColumn<UserRow>[] = Object.entries(gridConfig.columns).map(([key, column], index) => ({
        key,
        header: t(column.label),
        priority: index === 0 ? 'always' : index === 1 ? 'high' : index === 2 ? 'medium' : 'low',
        render: (row) =>
            column.type === 'boolean' ? (
                <FioriStatus label={row[key] ? t('active') : t('inactive')} tone={row[key] ? 'success' : 'neutral'} />
            ) : key === 'employee_id' || key === 'username' ? (
                <Typography component="span" fontWeight={600}>{row[key] || '-'}</Typography>
            ) : (
                row[key] || '-'
            ),
    }));

    if (visibleActions.length > 0) {
        columns.push({
            key: 'actions',
            header: '',
            priority: 'always',
            align: 'right',
            render: (row) => (
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                    {visibleActions.map(([actionKey, action]) => {
                        if (actionKey === 'delete' && row.id === auth.user?.id) {
                            return null;
                        }

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
                            <IconButton key={actionKey} size="small" sx={{ ...fioriIconButtonSx, display: 'flex', flexDirection: 'column' }} onClick={handleClick}>
                                <Icon fontSize="small" />
                                <Typography variant="caption" sx={{ fontSize: '0.6rem' }}>{t(action.label)}</Typography>
                            </IconButton>
                        );
                    })}
                </Box>
            ),
        });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('usersCount', { count: gridData.total })} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {tSystem('usersCount', { count: gridData.total })}
                        </Typography>
                        <Box sx={{ mt: 2 }}>
                            <TextField
                                placeholder={tSystem('searchByUsername')}
                                size="small"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
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
                    </Box>
                    {canCreate && (
                        <Box>
                            <Button variant="contained" sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }} onClick={() => setCreateOpen(true)}>
                                {tSystem('createUser')}
                            </Button>
                        </Box>
                    )}
                </Box>

                <CreateUserDialog
                    open={createOpen}
                    onClose={() => setCreateOpen(false)}
                    departments={departments}
                    jobPositions={jobPositions}
                />

                <FioriResponsiveTable
                    columns={columns}
                    rows={gridData.data}
                    getRowKey={(row) => row.id}
                    emptyMessage={t('noDataFound')}
                />
            </Box>
        <Dialog open={deleteUserId !== null} onClose={() => setDeleteUserId(null)}>
            <DialogTitle>{tSystem('confirmDeletionTitle')}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {tSystem('confirmDeleteUserMessage')}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDeleteUserId(null)} color="inherit" disabled={deleting} sx={fioriDefaultSx}>{t('cancel')}</Button>
                <Button onClick={() => {
                    if (deleteUserId !== null) {
                        setDeleting(true);
                        router.delete(`/system/user/${deleteUserId}`, {
                            onSuccess: () => setDeleteUserId(null),
                            onFinish: () => setDeleting(false),
                        });
                    }
                }} color="error" variant="contained" disabled={deleting} startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ textTransform: 'none', borderRadius: '8px' }}>
                    {t('delete')}
                </Button>
            </DialogActions>
        </Dialog>
        </AppLayout>
    );
}
