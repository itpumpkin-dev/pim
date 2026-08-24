import AppLayout from '@/layouts/app-layout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
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
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface ExportConfigItem {
    id: number;
    code: string;
    type: string;
    file_format: string;
    field_separator: string;
    with_media: boolean;
}

interface Props {
    config: ExportConfigItem;
    types: string[];
}

export default function ExportEdit({ config, types }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('exportsTitle'), href: '/import-export/exports' },
        { title: t('editExport'), href: '#' },
    ];

    const { data, setData, put, processing, errors, transform, isDirty, setDefaults } = useForm({
        code: config.code || '',
        type: config.type,
        file_format: config.file_format,
        field_separator: config.field_separator,
        with_media: Boolean(config.with_media),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const [activeAction, setActiveAction] = useState<'save' | 'run' | null>(null);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        setActiveAction('save');
        skipNavigationGuardRef.current = true;
        put(`/import-export/exports/${config.id}`, {
            onSuccess: () => router.visit('/import-export/exports', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
                setActiveAction(null);
            },
        });
    };

    const submitAndRun = (e: FormEvent) => {
        e.preventDefault();
        setActiveAction('run');
        transform((formData) => ({ ...formData, run: true }));
        skipNavigationGuardRef.current = true;
        put(`/import-export/exports/${config.id}`, {
            onSuccess: () => setDefaults(),
            onFinish: () => {
                transform((formData) => formData);
                skipNavigationGuardRef.current = false;
                setActiveAction(null);
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editExport')}: ${config.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('editExport')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/import-export/exports" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {tCatalog('back')}
                        </Button>
                        <Button type="submit" variant="outlined" disabled={processing} startIcon={activeAction === 'save' ? <CircularProgress size={16} /> : <SaveIcon />} sx={fioriDefaultSx}>
                            {activeAction === 'save' ? tCatalog('saving') : tCatalog('save')}
                        </Button>
                        <Button
                            variant="contained"
                            disabled={processing}
                            startIcon={activeAction === 'run' ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                            onClick={submitAndRun}
                            sx={fioriEmphasizedSx}
                        >
                            {t('exportNow')}
                        </Button>
                    </Stack>
                </Stack>

                <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: FIORI.textPrimary }}>{tCatalog('generalTitle')}</Typography>
                    <Stack spacing={3}>
                        <TextField
                            label={tCatalog('code')}
                            fullWidth
                            value={data.code}
                            disabled
                            helperText={tCatalog('codeLockedHelperText')}
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
