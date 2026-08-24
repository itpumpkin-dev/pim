import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import VisibilityIcon from '@mui/icons-material/Visibility';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import {
    Box,
    Button,
    IconButton,
    Pagination,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import {
    FIORI,
    FioriStatus,
    fioriCardSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
} from '@/lib/fiori-style';

interface UserSummary {
    id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
}

interface ConversionItem {
    id: number;
    original_filename: string;
    row_count: number;
    sku_missing_count: number;
    category_matched_count: number;
    category_unmatched_count: number;
    has_unmatched: boolean;
    creator: UserSummary | null;
    created_at: string;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    conversions: PaginatedData<ConversionItem>;
}

function formatLocalDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * The two conversion directions (import a WooCommerce export in, prepare an
 * export to send to WooCommerce) live under one "WooCommerce" menu entry but
 * are otherwise unrelated flows. Presenting them as two clearly-labeled
 * cards up front — rather than a generic "New Conversion" button next to an
 * "Export" button — is what keeps users from picking the wrong one.
 */
function DirectionCard({
    icon,
    title,
    description,
    buttonLabel,
    onClick,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    buttonLabel: string;
    onClick: () => void;
}) {
    return (
        <Paper
            elevation={0}
            sx={{
                ...fioriCardSx,
                p: 3,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                '&:hover': { borderColor: FIORI.brand },
            }}
            onClick={onClick}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        bgcolor: FIORI.selected,
                        color: FIORI.brand,
                        flexShrink: 0,
                    }}
                >
                    {icon}
                </Box>
                <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{title}</Typography>
            </Box>
            <Typography variant="body2" sx={{ color: FIORI.textSecondary, flex: 1 }}>
                {description}
            </Typography>
            <Button
                variant="text"
                endIcon={<ArrowForwardIcon />}
                sx={{ ...fioriGhostSx, alignSelf: 'flex-start', mt: 1 }}
                onClick={onClick}
            >
                {buttonLabel}
            </Button>
        </Paper>
    );
}

export default function WooConvertIndex({ conversions }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('wooConvertTitle'), href: '/import-export/woo-convert' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('woo_conversions.create_woo_conversions');

    const userLabel = (user: UserSummary | null) => {
        if (!user) return '-';
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
        return fullName || user.username;
    };

    const handlePageChange = (_: unknown, page: number) => {
        router.get('/import-export/woo-convert', { page }, { preserveState: true });
    };

    // Column pop-in priority (SAP Fiori responsive table): the uploaded
    // filename is the identifying column and stays visible at every width;
    // the category-match status is the primary progress indicator so it
    // follows next; row count/user/date are secondary metadata that reflow
    // into the pop-in area first. The numeric ID is the least useful on a
    // phone. The view action stays pinned like the identifying column.
    const columns: FioriResponsiveColumn<ConversionItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'filename',
            header: t('uploadedFile'),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.original_filename}</Typography>,
        },
        {
            key: 'rowCount',
            header: t('wooConvertRowsConverted'),
            priority: 'medium',
            align: 'right',
            render: (row) => row.row_count,
        },
        {
            key: 'categoriesMatched',
            header: t('wooConvertCategoriesMatched'),
            priority: 'high',
            render: (row) => (
                <FioriStatus
                    label={`${row.category_matched_count} / ${row.category_matched_count + row.category_unmatched_count}`}
                    tone={row.has_unmatched ? 'warning' : 'success'}
                />
            ),
        },
        {
            key: 'user',
            header: t('user'),
            priority: 'medium',
            render: (row) => userLabel(row.creator),
        },
        {
            key: 'startedAt',
            header: t('startedAt'),
            priority: 'medium',
            render: (row) => formatLocalDateTime(row.created_at),
        },
        {
            key: 'actions',
            header: tGrid('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <IconButton
                    size="small"
                    sx={fioriIconButtonSx}
                    onClick={(e) => {
                        e.stopPropagation();
                        router.visit(`/import-export/woo-convert/${row.id}`);
                    }}
                >
                    <VisibilityIcon fontSize="small" />
                </IconButton>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('wooConvertTitle')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('wooConvertTitle')}</Typography>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{t('wooHubSubtitle')}</Typography>
                </Box>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 4 }}>
                    {canCreate && (
                        <DirectionCard
                            icon={<UploadFileIcon />}
                            title={t('wooImportCardTitle')}
                            description={t('wooImportCardDesc')}
                            buttonLabel={t('wooConvertNewConversion')}
                            onClick={() => router.visit('/import-export/woo-convert/create')}
                        />
                    )}
                    <DirectionCard
                        icon={<DownloadIcon />}
                        title={t('wooExportTitle')}
                        description={t('wooExportCardDesc')}
                        buttonLabel={t('wooExportCardButton')}
                        onClick={() => router.visit('/import-export/woo-convert/export')}
                    />
                </Stack>

                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('wooConvertHistoryTitle')}</Typography>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>{tGrid('results', { count: conversions.total })}</Typography>
                </Stack>

                {conversions.data.length === 0 ? (
                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 6, textAlign: 'center' }}>
                        <UploadFileIcon sx={{ fontSize: 40, color: FIORI.textSecondary, mb: 1 }} />
                        <Typography sx={{ color: FIORI.textSecondary, mb: canCreate ? 2 : 0 }}>{t('wooConvertNoneFound')}</Typography>
                        {canCreate && (
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => router.visit('/import-export/woo-convert/create')}
                                sx={fioriEmphasizedSx}
                            >
                                {t('wooConvertNewConversion')}
                            </Button>
                        )}
                    </Paper>
                ) : (
                    <FioriResponsiveTable
                        columns={columns}
                        rows={conversions.data}
                        getRowKey={(row) => row.id}
                        onRowClick={(row) => router.visit(`/import-export/woo-convert/${row.id}`)}
                    />
                )}

                {conversions.last_page > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination
                            count={conversions.last_page}
                            page={conversions.current_page}
                            onChange={handlePageChange}
                            sx={{
                                '& .MuiPaginationItem-root': { borderRadius: '6px', color: FIORI.textPrimary },
                                '& .Mui-selected': { bgcolor: `${FIORI.brand} !important`, color: '#fff' },
                            }}
                        />
                    </Box>
                )}
            </Box>
        </AppLayout>
    );
}
