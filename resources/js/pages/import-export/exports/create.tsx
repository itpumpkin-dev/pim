import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
    Alert,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
    types: string[];
}

export default function ExportCreate({ types }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('exportsTitle'), href: '/import-export/exports' },
        { title: t('createExport'), href: '/import-export/exports/create' },
    ];

    const { data, setData, post, processing, errors, transform } = useForm({
        code: '',
        type: types[0] ?? 'products',
        file_format: 'csv',
        field_separator: ',',
        with_media: false,
    });

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        post('/import-export/exports', {
            onSuccess: () => router.visit('/import-export/exports', { replace: true }),
        });
    };

    const submitAndRun = (e: FormEvent) => {
        e.preventDefault();
        transform((formData) => ({ ...formData, run: true }));
        post('/import-export/exports', {
            onFinish: () => transform((formData) => formData),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createExport')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('createExport')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/import-export/exports" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {tCatalog('back')}
                        </Button>
                        <Button type="submit" variant="outlined" disabled={processing} startIcon={<SaveIcon />}>
                            {tCatalog('save')}
                        </Button>
                        <Button
                            sx={{ color: 'white' }}
                            variant="contained"
                            disabled={processing}
                            startIcon={<PlayArrowIcon />}
                            onClick={submitAndRun}
                        >
                            {t('exportNow')}
                        </Button>
                    </Stack>
                </Stack>

                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{tCatalog('generalTitle')}</Typography>
                    <Stack spacing={3}>
                        <TextField
                            label={tCatalog('codeRequired')}
                            required
                            fullWidth
                            value={data.code}
                            onChange={(e) => setData('code', e.target.value)}
                            error={Boolean(errors.code)}
                            helperText={errors.code ?? tCatalog('codeHelperText')}
                        />
                        <FormControl fullWidth>
                            <InputLabel id="export-type-label">{t('typeLabel')}</InputLabel>
                            <Select
                                labelId="export-type-label"
                                label={t('typeLabel')}
                                value={data.type}
                                onChange={(e) => setData('type', e.target.value)}
                            >
                                {types.map((type) => (
                                    <MenuItem key={type} value={type}>{typeLabel(type)}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label={t('fieldSeparator')}
                            fullWidth
                            value={data.field_separator}
                            onChange={(e) => setData('field_separator', e.target.value)}
                            error={Boolean(errors.field_separator)}
                            helperText={errors.field_separator}
                        />
                        <FormControl fullWidth>
                            <InputLabel id="export-format-label">{t('fileFormat')}</InputLabel>
                            <Select
                                labelId="export-format-label"
                                label={t('fileFormat')}
                                value={data.file_format}
                                onChange={(e) => setData('file_format', e.target.value)}
                            >
                                <MenuItem value="csv">CSV</MenuItem>
                                <MenuItem value="xls">XLS</MenuItem>
                                <MenuItem value="xlsx">XLSX</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControlLabel
                            control={<Switch checked={data.with_media} onChange={(e) => setData('with_media', e.target.checked)} />}
                            label={t('withMedia')}
                        />
                    </Stack>
                </Paper>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {tCatalog('correctHighlightedFields')}
                    </Alert>
                )}
            </Box>
        </AppLayout>
    );
}
