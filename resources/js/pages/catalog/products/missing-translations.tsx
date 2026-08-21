import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import TranslateIcon from '@mui/icons-material/Translate';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    IconButton,
    InputAdornment,
    LinearProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mappedChipSx, naChipSx, percentTone, solidActionSx, UI_BORDER } from '@/lib/ui-style';

interface LocaleOption {
    id: number;
    code: string;
    display_name: string | null;
}

interface MissingAttribute {
    id: number;
    code: string;
    name: string | null;
}

interface MissingLocaleEntry {
    locale: LocaleOption;
    missing_attributes: MissingAttribute[];
}

interface MissingRow {
    id: number;
    sku: string;
    family: string | null;
    enabled: boolean;
    missing_locales: MissingLocaleEntry[];
}

interface Props {
    rows: MissingRow[];
    totalProducts: number;
}

export default function MissingTranslations({ rows, totalProducts }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('product_translations.edit_product_translations');
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [translatingId, setTranslatingId] = useState<number | null>(null);
    const [bulkTranslating, setBulkTranslating] = useState(false);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: tNav('missingTranslations'), href: '#' },
    ];

    const filteredRows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return rows;

        return rows.filter(
            (row) => row.sku.toLowerCase().includes(needle) || (row.family ?? '').toLowerCase().includes(needle),
        );
    }, [rows, search]);

    const pagedRows = filteredRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    const translatedCount = totalProducts - rows.length;
    const percent = totalProducts > 0 ? Math.round((translatedCount / totalProducts) * 100) : 100;
    const progressTone = percentTone(percent, { high: 100, mid: 50 });

    const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));
    const someFilteredSelected = filteredRows.some((row) => selectedIds.has(row.id));

    const toggleSelectAll = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) {
                filteredRows.forEach((row) => next.delete(row.id));
            } else {
                filteredRows.forEach((row) => next.add(row.id));
            }
            return next;
        });
    };

    const toggleRow = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const translateOne = (id: number) => {
        setTranslatingId(id);
        router.post(
            `/catalog/products/${id}/queue-missing-translations`,
            {},
            { preserveScroll: true, onFinish: () => setTranslatingId(null) },
        );
    };

    const translateSelected = () => {
        setBulkTranslating(true);
        router.post(
            '/catalog/product-translations/queue-bulk',
            { product_ids: Array.from(selectedIds) },
            {
                preserveScroll: true,
                onSuccess: () => setSelectedIds(new Set()),
                onFinish: () => setBulkTranslating(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('missingTranslationsTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: 'background.default', minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }} flexWrap="wrap" gap={2}>
                    <Box>
                        <Typography variant="h5" fontWeight={700} color="text.primary">
                            {t('missingTranslationsTitle')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {t('missingTranslationsSubtitle')}
                        </Typography>
                    </Box>
                    {canEdit && (
                        <Button
                            variant="contained"
                            startIcon={bulkTranslating ? <CircularProgress size={16} color="inherit" /> : <TranslateIcon fontSize="small" />}
                            disabled={selectedIds.size === 0 || bulkTranslating}
                            onClick={translateSelected}
                            sx={{ ...solidActionSx, textTransform: 'none', fontWeight: 700 }}
                        >
                            {bulkTranslating
                                ? t('missingTranslationsTranslating')
                                : t('missingTranslationsTranslateSelected', { count: selectedIds.size })}
                        </Button>
                    )}
                </Stack>

                <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5, mb: 2, borderColor: UI_BORDER }}>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Typography variant="subtitle1" fontWeight={700}>
                            {t('missingTranslationsSummary', { missing: rows.length, total: totalProducts })}
                        </Typography>
                        <Chip
                            label={`${translatedCount} / ${totalProducts} · ${percent}%`}
                            size="small"
                            sx={{ bgcolor: progressTone.bg, color: progressTone.fg, fontWeight: 600, height: 22, fontSize: '0.7rem' }}
                        />
                    </Stack>
                    <LinearProgress
                        variant="determinate"
                        value={percent}
                        sx={{
                            mt: 1.5,
                            height: 6,
                            borderRadius: 3,
                            bgcolor: 'grey.200',
                            maxWidth: 320,
                            '& .MuiLinearProgress-bar': { bgcolor: progressTone.bg },
                        }}
                    />
                </Paper>

                {rows.length === 0 ? (
                    <Paper variant="outlined" sx={{ borderRadius: 2, p: 4, textAlign: 'center' }}>
                        <Typography color="text.secondary">{t('missingTranslationsAllTranslated')}</Typography>
                    </Paper>
                ) : (
                    <>
                        <TextField
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(0);
                            }}
                            placeholder={t('missingTranslationsSearch')}
                            size="small"
                            sx={{ mb: 2, minWidth: 320, bgcolor: '#fff' }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                            <Table size="small">
                                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                    <TableRow>
                                        {canEdit && (
                                            <TableCell padding="checkbox">
                                                <Checkbox
                                                    size="small"
                                                    checked={allFilteredSelected}
                                                    indeterminate={someFilteredSelected && !allFilteredSelected}
                                                    onChange={toggleSelectAll}
                                                />
                                            </TableCell>
                                        )}
                                        <TableCell sx={{ fontWeight: 700 }}>{t('missingTranslationsColSku')}</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>{t('missingTranslationsColFamily')}</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>{t('missingTranslationsColStatus')}</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>{t('missingTranslationsColMissingLocales')}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                                            {t('missingTranslationsColActions')}
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {pagedRows.map((row) => (
                                        <TableRow key={row.id} hover selected={selectedIds.has(row.id)}>
                                            {canEdit && (
                                                <TableCell padding="checkbox">
                                                    <Checkbox size="small" checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} />
                                                </TableCell>
                                            )}
                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row.sku}</TableCell>
                                            <TableCell>{row.family ?? '-'}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={row.enabled ? t('enabled') : t('disabled')}
                                                    size="small"
                                                    variant={row.enabled ? 'filled' : 'outlined'}
                                                    sx={
                                                        row.enabled
                                                            ? { ...mappedChipSx, height: 20, fontSize: '0.7rem' }
                                                            : { ...naChipSx, height: 20, fontSize: '0.7rem' }
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                    {row.missing_locales.map(({ locale, missing_attributes }) => (
                                                        <Tooltip
                                                            key={locale.id}
                                                            title={missing_attributes.map((a) => a.name || a.code).join(', ')}
                                                        >
                                                            <Chip
                                                                label={`${locale.display_name || locale.code} (${missing_attributes.length})`}
                                                                size="small"
                                                                variant="outlined"
                                                                sx={{ height: 20, fontSize: '0.7rem' }}
                                                            />
                                                        </Tooltip>
                                                    ))}
                                                </Stack>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    {canEdit && (
                                                        <Tooltip title={t('missingTranslationsTranslateAction')}>
                                                            <span>
                                                                <IconButton
                                                                    size="small"
                                                                    disabled={translatingId === row.id}
                                                                    onClick={() => translateOne(row.id)}
                                                                >
                                                                    {translatingId === row.id ? (
                                                                        <CircularProgress size={16} />
                                                                    ) : (
                                                                        <TranslateIcon fontSize="small" />
                                                                    )}
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip title={t('missingTranslationsEditAction')}>
                                                        <IconButton
                                                            size="small"
                                                            component={Link}
                                                            href={`/catalog/products/${row.id}/edit`}
                                                        >
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredRows.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={canEdit ? 6 : 5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                {t('missingTranslationsNoMatches')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            <TablePagination
                                component="div"
                                count={filteredRows.length}
                                page={page}
                                onPageChange={(_, newPage) => setPage(newPage)}
                                rowsPerPage={rowsPerPage}
                                onRowsPerPageChange={(e) => {
                                    setRowsPerPage(parseInt(e.target.value, 10));
                                    setPage(0);
                                }}
                                rowsPerPageOptions={[25, 50, 100, 250]}
                                labelRowsPerPage={t('missingTranslationsRowsPerPage')}
                            />
                        </TableContainer>
                    </>
                )}
            </Box>
        </AppLayout>
    );
}
