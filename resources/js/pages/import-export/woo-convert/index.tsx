import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import {
    Box,
    Button,
    Chip,
    IconButton,
    Pagination,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('wooConvertTitle')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>{t('wooConvertTitle')}</Typography>
                        <Typography color="text.secondary">{tGrid('results', { count: conversions.total })}</Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            sx={{ color: 'white' }}
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/import-export/woo-convert/create')}
                        >
                            {t('wooConvertNewConversion')}
                        </Button>
                    )}
                </Box>

                {conversions.data.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
                        <UploadFileIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography color="text.secondary" sx={{ mb: canCreate ? 2 : 0 }}>{t('wooConvertNoneFound')}</Typography>
                        {canCreate && (
                            <Button
                                sx={{ color: 'white' }}
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => router.visit('/import-export/woo-convert/create')}
                            >
                                {t('wooConvertNewConversion')}
                            </Button>
                        )}
                    </Paper>
                ) : (
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('uploadedFile')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="right">{t('wooConvertRowsConverted')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('wooConvertCategoriesMatched')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('user')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('startedAt')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {conversions.data.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        hover
                                        onClick={() => router.visit(`/import-export/woo-convert/${row.id}`)}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell>{row.id}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{row.original_filename}</TableCell>
                                        <TableCell align="right">{row.row_count}</TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={`${row.category_matched_count} / ${row.category_matched_count + row.category_unmatched_count}`}
                                                color={row.has_unmatched ? 'warning' : 'success'}
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell>{userLabel(row.creator)}</TableCell>
                                        <TableCell>{formatLocalDateTime(row.created_at)}</TableCell>
                                        <TableCell align="right">
                                            <IconButton
                                                size="small"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.visit(`/import-export/woo-convert/${row.id}`);
                                                }}
                                            >
                                                <VisibilityIcon fontSize="small" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                {conversions.last_page > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination count={conversions.last_page} page={conversions.current_page} onChange={handlePageChange} color="primary" />
                    </Box>
                )}
            </Box>
        </AppLayout>
    );
}
