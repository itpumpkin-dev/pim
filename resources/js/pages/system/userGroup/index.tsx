import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    InputAdornment,
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

    // Column pop-in priority (SAP Fiori responsive table): columns come from
    // the server-driven gridConfig, so priority falls out of column order —
    // the first (name) column identifies the row and always stays, the next
    // two follow as space allows, the rest reflow into the pop-in area
    // first. Row actions stay pinned like the identifying column.
    type GroupRow = UserGroupIndexProps['gridData']['data'][number];
    const columns: FioriResponsiveColumn<GroupRow>[] = Object.entries(gridConfig.columns).map(([key, column], index) => ({
        key,
        header: t(column.label),
        priority: index === 0 ? 'always' : index === 1 ? 'high' : index === 2 ? 'medium' : 'low',
        render: (row) =>
            column.type === 'boolean' ? (
                <FioriStatus label={row[key] ? t('active') : t('inactive')} tone={row[key] ? 'success' : 'neutral'} />
            ) : key === 'name' ? (
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
            <Head title={tSystem('userGroupsCount', { count: gridData.total })} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {tSystem('userGroupsCount', { count: gridData.total })}
                        </Typography>
                        <Box sx={{ mt: 2 }}>
                            <TextField
                                placeholder={tSystem('searchByName')}
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
                            <Button
                                variant="contained"
                                sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }}
                                onClick={() => router.visit('/system/userGroup/create')}
                            >
                                {tSystem('createUserGroup')}
                            </Button>
                        </Box>
                    )}
                </Box>

                <Box sx={{ mt: 4 }}>
                    <FioriResponsiveTable
                        columns={columns}
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noDataFound')}
                    />
                </Box>
            </Box>

            <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{tSystem('deleteGroupTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {tSystem('confirmDeleteGroupMessage', { name: deleteTarget?.name })}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button variant="outlined" color="inherit" onClick={() => setDeleteTarget(null)} disabled={deleting} sx={fioriDefaultSx}>
                        {t('cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={confirmDelete}
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ textTransform: 'none', borderRadius: '8px' }}
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
