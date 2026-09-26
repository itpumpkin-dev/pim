import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriMessageStrip } from '@/components/fiori-form';
import { FIORI, FioriStatus, fioriCardSx, fioriEmphasizedSx, fioriIconButtonSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface ApiSourceRow {
    id: number;
    name: string;
    endpoint: string;
    auth_type: string;
    is_active: boolean;
    [key: string]: unknown;
}
interface GridData {
    data: ApiSourceRow[];
    total: number;
    current_page?: number;
    last_page?: number;
}
interface Props {
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function AttributeApiSourceIndex({ gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributes'), href: '/catalog/attributes' },
        { title: tNav('attributeApiSources'), href: '/catalog/attributes/api-sources' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('attribute_api_sources.create_attribute_api_sources');
    const canEdit = permissions.includes('attribute_api_sources.edit_attribute_api_sources');
    const canDelete = permissions.includes('attribute_api_sources.delete_attribute_api_sources');

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [testingId, setTestingId] = useState<number | null>(null);
    const [testMessage, setTestMessage] = useState<{ id: number; ok: boolean; text: string } | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/attributes/api-sources', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    const runTest = (row: ApiSourceRow) => {
        setTestingId(row.id);
        setTestMessage(null);
        fetch(`/catalog/attributes/api-sources/${row.id}/test`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const json = await res.json();
                if (!res.ok) {
                    setTestMessage({ id: row.id, ok: false, text: tCatalog('testConnectionFailed', { error: json.error ?? '' }) });
                    return;
                }
                const rows = json.rows ?? [];
                setTestMessage({
                    id: row.id,
                    ok: rows.length > 0,
                    text: rows.length > 0 ? tCatalog('testConnectionSuccess', { count: rows.length }) : tCatalog('testConnectionEmpty'),
                });
            })
            .catch(() => setTestMessage({ id: row.id, ok: false, text: 'Network error' }))
            .finally(() => setTestingId(null));
    };

    const columns: FioriResponsiveColumn<ApiSourceRow>[] = [
        {
            key: 'name',
            header: t('fields.name'),
            priority: 'always',
            render: (row) => <Typography component="span" fontWeight={600}>{row.name}</Typography>,
        },
        {
            key: 'endpoint',
            header: t('fields.endpoint'),
            priority: 'high',
            render: (row) => <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{row.endpoint}</Typography>,
        },
        {
            key: 'auth_type',
            header: t('fields.authType'),
            priority: 'medium',
            render: (row) => row.auth_type,
        },
        {
            key: 'status',
            header: t('fields.status'),
            priority: 'medium',
            render: (row) => <FioriStatus label={row.is_active ? t('enabled') : t('disabled')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        {
            key: 'actions',
            header: t('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title={t('rowActions.test')}>
                        <IconButton size="small" sx={fioriIconButtonSx} disabled={testingId === row.id} onClick={() => runTest(row)}>
                            {testingId === row.id ? <CircularProgress size={18} color="inherit" /> : <SyncIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    {canEdit && (
                        <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/attributes/api-sources/${row.id}/edit`)}>
                            <EditIcon fontSize="small" />
                        </IconButton>
                    )}
                    {canDelete && (
                        <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteId(row.id)}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    )}
                </Stack>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tCatalog('attributeApiSourcesTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {tCatalog('attributeApiSourcesTitle')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            variant="contained"
                            onClick={() => router.visit('/catalog/attributes/api-sources/create')}
                            sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }}
                        >
                            {tCatalog('createAttributeApiSource')}
                        </Button>
                    )}
                </Stack>

                {testMessage && (
                    <FioriMessageStrip severity={testMessage.ok ? 'success' : 'error'} sx={{ mb: 2 }}>
                        {testMessage.text}
                    </FioriMessageStrip>
                )}

                <Paper elevation={0} sx={fioriCardSx}>
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={2}
                        sx={{ p: 2 }}
                    >
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                            <TextField
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={tCatalog('searchAttributeApiSources')}
                                size="small"
                                sx={{ ...fioriSearchFieldSx, minWidth: 240 }}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Stack>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {t('pageOf', { lastPage })} ({currentPage})
                        </Typography>
                    </Stack>

                    <Divider sx={{ borderColor: FIORI.border }} />

                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={gridData.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={tCatalog('noAttributeApiSourcesFound')}
                    />
                </Paper>
            </Box>

            <FioriMessageBox
                open={deleteId !== null}
                onCancel={() => setDeleteId(null)}
                onConfirm={() => {
                    if (deleteId !== null) {
                        setDeleting(true);
                        router.delete(`/catalog/attributes/api-sources/${deleteId}`, {
                            onSuccess: () => setDeleteId(null),
                            onFinish: () => setDeleting(false),
                        });
                    }
                }}
                title={t('confirmDeletion')}
                severity="warning"
                destructive
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                confirmLoading={deleting}
            >
                {tCatalog('confirmDeleteAttributeApiSourceMessage')}
            </FioriMessageBox>
        </AppLayout>
    );
}
