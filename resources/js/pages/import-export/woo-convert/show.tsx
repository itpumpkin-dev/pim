import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
    Alert,
    Box,
    Button,
    Divider,
    Grid,
    Menu,
    MenuItem,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface UserSummary {
    id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
}

interface Conversion {
    id: number;
    original_filename: string;
    row_count: number;
    sku_missing_count: number;
    category_matched_count: number;
    category_unmatched_count: number;
    brand_new_count: number;
    brand_new_names: string[];
    brand_new_names_total: number;
    type_warnings: string[];
    type_warnings_total: number;
    emitted_name: boolean;
    emitted_description: boolean;
    has_unmatched: boolean;
    creator: UserSummary | null;
    created_at: string;
}

interface Props {
    conversion: Conversion;
}

function formatLocalDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function WooConvertShow({ conversion }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('wooConvertTitle'), href: '/import-export/woo-convert' },
        { title: `#${conversion.id}`, href: '#' },
    ];

    const [downloadAnchor, setDownloadAnchor] = useState<HTMLElement | null>(null);

    const creatorLabel = (() => {
        if (!conversion.creator) return '-';
        const fullName = [conversion.creator.first_name, conversion.creator.last_name].filter(Boolean).join(' ').trim();
        return fullName || conversion.creator.username;
    })();

    const stat = (label: string, value: number, tone: 'neutral' | 'good' | 'warn' = 'neutral', icon?: ReactNode) => {
        const toneColor = tone === 'warn' ? 'warning.main' : tone === 'good' ? 'success.main' : 'text.primary';
        return (
            <Grid item xs={6} sm={3}>
                <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', borderColor: tone === 'neutral' ? undefined : toneColor }}>
                    <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                        {icon}
                        <Typography variant="h4" fontWeight={700} color={toneColor}>{value}</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                </Paper>
            </Grid>
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('wooConvertResultTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('wooConvertResultTitle')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/import-export/woo-convert" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {tCatalog('back')}
                        </Button>
                        <Button component={Link} href="/import-export/woo-convert/create" variant="outlined" startIcon={<AddIcon />}>
                            {t('wooConvertAnother')}
                        </Button>
                    </Stack>
                </Stack>

                <Alert severity="success" sx={{ mb: 1 }}>
                    {t('wooConvertResultSummary', {
                        file: conversion.original_filename,
                        count: conversion.row_count,
                        skipped: conversion.sku_missing_count,
                    })}
                </Alert>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
                    {formatLocalDateTime(conversion.created_at)} · {creatorLabel}
                </Typography>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    {stat(t('wooConvertRowsConverted'), conversion.row_count, 'good', <CheckCircleIcon color="success" fontSize="small" />)}
                    {stat(
                        t('wooConvertRowsSkipped'),
                        conversion.sku_missing_count,
                        conversion.sku_missing_count > 0 ? 'warn' : 'neutral',
                        conversion.sku_missing_count > 0 ? <WarningAmberIcon color="warning" fontSize="small" /> : undefined
                    )}
                    {stat(t('wooConvertCategoriesMatched'), conversion.category_matched_count, 'good', <CheckCircleIcon color="success" fontSize="small" />)}
                    {stat(
                        t('wooConvertCategoriesUnmatched'),
                        conversion.category_unmatched_count,
                        conversion.category_unmatched_count > 0 ? 'warn' : 'neutral',
                        conversion.category_unmatched_count > 0 ? <WarningAmberIcon color="warning" fontSize="small" /> : undefined
                    )}
                    {stat(
                        t('wooConvertBrandsCreated'),
                        conversion.brand_new_count,
                        conversion.brand_new_count > 0 ? 'warn' : 'neutral',
                        conversion.brand_new_count > 0 ? <WarningAmberIcon color="warning" fontSize="small" /> : undefined
                    )}
                </Grid>

                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('wooConvertDownloadsTitle')}</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <Button
                                variant="contained"
                                sx={{ color: 'white' }}
                                startIcon={<DownloadIcon />}
                                endIcon={<ArrowDropDownIcon />}
                                onClick={(e) => setDownloadAnchor(e.currentTarget)}
                            >
                                {t('wooConvertDownloadButton')}
                            </Button>
                            <Menu anchorEl={downloadAnchor} open={Boolean(downloadAnchor)} onClose={() => setDownloadAnchor(null)}>
                                <MenuItem
                                    component="a"
                                    href={`/import-export/woo-convert/${conversion.id}/download`}
                                    onClick={() => setDownloadAnchor(null)}
                                >
                                    {t('wooConvertDownloadCsv')}
                                </MenuItem>
                                <MenuItem
                                    component="a"
                                    href={`/import-export/woo-convert/${conversion.id}/download-xlsx`}
                                    onClick={() => setDownloadAnchor(null)}
                                >
                                    {t('wooConvertDownloadXlsx')}
                                </MenuItem>
                            </Menu>
                            {conversion.has_unmatched && (
                                <Button
                                    variant="outlined"
                                    startIcon={<DownloadIcon />}
                                    href={`/import-export/woo-convert/${conversion.id}/download-unmatched`}
                                >
                                    {t('wooConvertDownloadUnmatched')}
                                </Button>
                            )}
                        </Stack>
                        {conversion.has_unmatched && (
                            <Alert severity="warning" sx={{ mt: 2 }}>
                                {t('wooConvertUnmatchedHelp')}
                            </Alert>
                        )}
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                            {t('wooConvertNextStep')}
                        </Typography>
                        <Button
                            component={Link}
                            href="/import-export/imports/create"
                            variant="text"
                            endIcon={<ArrowForwardIcon />}
                        >
                            {t('wooConvertGoToImport')}
                        </Button>
                    </Paper>

                    {(conversion.emitted_name || conversion.emitted_description) && (
                        <Alert severity="info" sx={{ whiteSpace: 'pre-line' }}>
                            {t('wooConvertLocaleCaveat')}
                        </Alert>
                    )}

                    {conversion.brand_new_names.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 3 }}>
                            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
                                {t('wooConvertNewBrandsTitle', { count: conversion.brand_new_names_total })}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                {t('wooConvertNewBrandsHelp')}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ maxHeight: 320, overflowY: 'auto' }}>
                                {conversion.brand_new_names.map((name, i) => (
                                    <Typography
                                        key={i}
                                        variant="body2"
                                        sx={{ px: 1, py: 0.5, bgcolor: 'action.hover', borderRadius: 1 }}
                                    >
                                        {name}
                                    </Typography>
                                ))}
                            </Stack>
                            {conversion.brand_new_names_total > conversion.brand_new_names.length && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    {t('wooConvertTypeWarningsTruncated', {
                                        remaining: conversion.brand_new_names_total - conversion.brand_new_names.length,
                                    })}
                                </Typography>
                            )}
                        </Paper>
                    )}

                    {conversion.type_warnings.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 3 }}>
                            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                                {t('wooConvertTypeWarningsTitle', { count: conversion.type_warnings_total })}
                            </Typography>
                            <Stack spacing={1} sx={{ maxHeight: 320, overflowY: 'auto' }}>
                                {conversion.type_warnings.map((warning, i) => (
                                    <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                                        <WarningAmberIcon color="warning" sx={{ fontSize: 16, mt: 0.3, flexShrink: 0 }} />
                                        <Typography variant="body2" color="text.secondary">{warning}</Typography>
                                    </Stack>
                                ))}
                            </Stack>
                            {conversion.type_warnings_total > conversion.type_warnings.length && (
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                    {t('wooConvertTypeWarningsTruncated', {
                                        remaining: conversion.type_warnings_total - conversion.type_warnings.length,
                                    })}
                                </Typography>
                            )}
                        </Paper>
                    )}
                </Stack>
            </Box>
        </AppLayout>
    );
}
