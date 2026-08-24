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
    Divider,
    InputAdornment,
    Paper,
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
    fioriCardSx,
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

interface JobPositionIndexProps {
    gridConfig: GridConfig;
    gridData: PaginationData<any>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
}

export default function JobPositionIndex({ gridConfig, gridData, filters }: JobPositionIndexProps) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('jobPositions'), href: '/system/jobPosition' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('job_positions.create_job_positions');
    const canEdit = permissions.includes('job_positions.edit_job_positions');
    const canDelete = permissions.includes('job_positions.delete_job_positions');

    const [search, setSearch] = useState(filters.search || '');
    const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const isFirstRender = useRef(true);

    const visibleActions = Object.entries(gridConfig.actions ?? {}).filter(([actionKey]) => {
        if (actionKey === 'update') return canEdit;
        if (actionKey === 'delete') return canDelete;
        return true;
    });

    // Column pop-in priority (SAP Fiori responsive table): this grid's
    // columns come from the server-driven gridConfig rather than a fixed
    // list, so priority falls out of column order — the first column
    // identifies the row and always stays, the next two follow as space
    // allows, and the rest reflow into the pop-in area first. Row actions
    // stay pinned like the identifying column since they're always reachable
    // in Fiori's pattern too.
    type JobPositionRow = PaginationData<any>['data'][number];
    const columns: FioriResponsiveColumn<JobPositionRow>[] = Object.entries(gridConfig.columns).map(([key, column], index) => ({
        key,
        header: t(column.label),
        priority: index === 0 ? 'always' : index === 1 ? 'high' : index === 2 ? 'medium' : 'low',
        render: (row) =>
            column.type === 'boolean' ? (
                <FioriStatus label={row[key] ? t('active') : t('inactive')} tone={row[key] ? 'success' : 'neutral'} />
            ) : (
                <Typography variant="body2" sx={{ fontWeight: key === 'name' ? 600 : 400 }}>
                    {row[key] || '-'}
                </Typography>
            ),
    }));

    if (visibleActions.length > 0) {
        columns.push({
            key: 'actions',
            header: t('actionsHeader'),
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
                                router.visit(`/system/jobPosition/${row.id}/edit`);
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

    const confirmDelete = () => {
        if (!deleteTarget) return;

        setDeleting(true);
        router.delete(`/system/jobPosition/${deleteTarget.id}`, {
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
            router.get('/system/jobPosition', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('jobPositionsCount', { count: gridData.total })} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600, color: FIORI.textPrimary }}>
                        {tSystem('jobPositionsCount', { count: gridData.total })}
                    </Typography>
                    {canCreate && (
                        <Button
                            variant="contained"
                            onClick={() => router.visit('/system/jobPosition/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {tSystem('createJobPosition')}
                        </Button>
                    )}
                </Box>

                <Paper elevation={0} sx={fioriCardSx}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', p: 2 }}>
                        <TextField
                            placeholder={tSystem('searchByName')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            size="small"
                            sx={{ ...fioriSearchFieldSx, minWidth: 300 }}
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
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noDataFound')}
                    />
                </Paper>
            </Box>

            <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{tSystem('deleteJobPositionTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {tSystem('confirmDeleteJobPositionMessage', { name: deleteTarget?.name })}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button variant="outlined" onClick={() => setDeleteTarget(null)} disabled={deleting} sx={fioriDefaultSx}>
                        {t('cancel')}
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={confirmDelete}
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
