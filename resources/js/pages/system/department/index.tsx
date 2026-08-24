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
import {
    FIORI,
    FioriStatus,
    fioriBodyCellSx,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
    fioriTableHeadCellSx,
    fioriTableHeadSx,
    fioriTableRowSx,
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

interface DepartmentIndexProps {
    gridConfig: GridConfig;
    gridData: PaginationData<any>;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
    };
}

export default function DepartmentIndex({ gridConfig, gridData, filters }: DepartmentIndexProps) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('departments'), href: '/system/department' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('departments.create_departments');
    const canEdit = permissions.includes('departments.edit_departments');
    const canDelete = permissions.includes('departments.delete_departments');

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
        router.delete(`/system/department/${deleteTarget.id}`, {
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
            router.get('/system/department', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [search]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('departmentsCount', { count: gridData.total })} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600, color: FIORI.textPrimary }}>
                        {tSystem('departmentsCount', { count: gridData.total })}
                    </Typography>
                    {canCreate && (
                        <Button
                            variant="contained"
                            onClick={() => router.visit('/system/department/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {tSystem('createDepartment')}
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

                    <TableContainer>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead sx={fioriTableHeadSx}>
                                <TableRow>
                                    {Object.entries(gridConfig.columns).map(([key, column]) => (
                                        <TableCell key={key} sx={fioriTableHeadCellSx}>
                                            {t(column.label)}
                                        </TableCell>
                                    ))}
                                    {visibleActions.length > 0 && <TableCell sx={fioriTableHeadCellSx} align="right">{t('actionsHeader')}</TableCell>}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {gridData.data.map((row) => (
                                    <TableRow key={row.id} sx={fioriTableRowSx(false)}>
                                        {Object.entries(gridConfig.columns).map(([key, column]) => (
                                            <TableCell key={key} sx={{ ...fioriBodyCellSx, fontWeight: key === 'name' ? 600 : 400 }}>
                                                {column.type === 'boolean' ? (
                                                    <FioriStatus
                                                        label={row[key] ? t('active') : t('inactive')}
                                                        tone={row[key] ? 'success' : 'neutral'}
                                                    />
                                                ) : (
                                                    row[key] || '-'
                                                )}
                                            </TableCell>
                                        ))}
                                        {visibleActions.length > 0 && (
                                            <TableCell align="right" sx={fioriBodyCellSx}>
                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                                                    {visibleActions.map(([actionKey, action]) => {
                                                        let Icon = EditIcon;
                                                        if (action.icon === 'copy') Icon = ContentCopyIcon;
                                                        if (action.icon === 'delete') Icon = DeleteIcon;

                                                        const handleClick = () => {
                                                            if (actionKey === 'update') {
                                                                router.visit(`/system/department/${row.id}/edit`);
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
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                                {gridData.data.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={Object.keys(gridConfig.columns).length + (visibleActions.length > 0 ? 1 : 0)} align="center" sx={{ py: 4, color: FIORI.textSecondary }}>
                                            {t('noDataFound')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </Box>

            <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{tSystem('deleteDepartmentTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {tSystem('confirmDeleteDepartmentMessage', { name: deleteTarget?.name })}
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
