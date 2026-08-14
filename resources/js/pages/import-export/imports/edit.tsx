import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    FormControl,
    FormHelperText,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ImportConfigItem {
    id: number;
    code: string;
    type: string;
    file_format: string;
    field_separator: string;
    action: string;
    validation_strategy: string;
    allowed_errors: number;
    image_directory_path: string | null;
    source_file_path: string | null;
}

interface Props {
    config: ImportConfigItem;
    types: string[];
    requiredColumnsByType: Record<string, string[]>;
    columnLabelsByType: Record<string, Record<string, string>>;
}

export default function ImportEdit({ config, types, requiredColumnsByType, columnLabelsByType }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('importsTitle'), href: '/import-export/imports' },
        { title: t('editImport'), href: '#' },
    ];

    const { data, setData, post, processing, errors, transform } = useForm({
        code: config.code || '',
        type: config.type,
        file_format: config.file_format,
        field_separator: config.field_separator,
        action: config.action,
        validation_strategy: config.validation_strategy,
        allowed_errors: config.allowed_errors,
        image_directory_path: config.image_directory_path || '',
        file: null as File | null,
    });

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const [activeAction, setActiveAction] = useState<'save' | 'run' | null>(null);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        setActiveAction('save');
        transform((formData) => ({ ...formData, _method: 'put' }));
        post(`/import-export/imports/${config.id}`, {
            onSuccess: () => router.visit('/import-export/imports', { replace: true }),
            onFinish: () => setActiveAction(null),
        });
    };

    const submitAndRun = (e: FormEvent) => {
        e.preventDefault();
        setActiveAction('run');
        transform((formData) => ({ ...formData, _method: 'put', run: true }));
        post(`/import-export/imports/${config.id}`, {
            onFinish: () => {
                transform((formData) => formData);
                setActiveAction(null);
            },
        });
    };

    const downloadSample = () => {
        window.open(`/import-export/imports/sample/${data.type}`, '_blank');
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editImport')}: ${config.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('editImport')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/import-export/imports" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {tCatalog('back')}
                        </Button>
                        <Button type="submit" variant="outlined" disabled={processing} startIcon={activeAction === 'save' ? <CircularProgress size={16} /> : <SaveIcon />}>
                            {activeAction === 'save' ? tCatalog('saving') : tCatalog('save')}
                        </Button>
                        <Button
                            sx={{ color: 'white' }}
                            variant="contained"
                            disabled={processing}
                            startIcon={activeAction === 'run' ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                            onClick={submitAndRun}
                        >
                            {t('importNow')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{tCatalog('generalTitle')}</Typography>
                        <Stack spacing={3}>
                            <TextField
                                label={tCatalog('code')}
                                fullWidth
                                value={data.code}
                                disabled
                                helperText={tCatalog('codeLockedHelperText')}
                            />
                            <FormControl fullWidth>
                                <InputLabel id="import-type-label">{t('typeLabel')}</InputLabel>
                                <Select
                                    labelId="import-type-label"
                                    label={t('typeLabel')}
                                    value={data.type}
                                    onChange={(e) => setData('type', e.target.value)}
                                >
                                    {types.map((type) => (
                                        <MenuItem key={type} value={type}>{typeLabel(type)}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Box>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
                                        {t('chooseFile')}
                                        <input
                                            type="file"
                                            hidden
                                            accept=".csv,.xls,.xlsx"
                                            onChange={(e) => setData('file', e.target.files?.[0] ?? null)}
                                        />
                                    </Button>
                                    <Typography variant="body2" color="text.secondary">
                                        {data.file ? data.file.name : config.source_file_path ? config.source_file_path.split('/').pop() : t('noFileUploaded')}
                                    </Typography>
                                    <Button variant="text" startIcon={<DownloadIcon />} onClick={downloadSample}>
                                        {t('downloadSample')}
                                    </Button>
                                </Stack>
                                {(requiredColumnsByType[data.type] ?? []).length > 0 && (
                                    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}>
                                        <Typography variant="caption" color="text.secondary">
                                            {t('requiredFields')}:
                                        </Typography>
                                        {requiredColumnsByType[data.type].map((column) => (
                                            <Chip key={column} label={columnLabelsByType[data.type]?.[column] ?? column} size="small" variant="outlined" />
                                        ))}
                                    </Stack>
                                )}
                                {errors.file && <FormHelperText error>{errors.file}</FormHelperText>}
                            </Box>

                            <TextField
                                label={t('imageDirectoryPath')}
                                fullWidth
                                value={data.image_directory_path}
                                onChange={(e) => setData('image_directory_path', e.target.value)}
                                error={Boolean(errors.image_directory_path)}
                                helperText={errors.image_directory_path}
                            />
                        </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('settingsTitle')}</Typography>
                        <Stack spacing={3}>
                            <FormControl fullWidth>
                                <InputLabel id="import-action-label">{t('action')}</InputLabel>
                                <Select
                                    labelId="import-action-label"
                                    label={t('action')}
                                    value={data.action}
                                    onChange={(e) => setData('action', e.target.value)}
                                >
                                    <MenuItem value="create_update">{t('actionCreateUpdate')}</MenuItem>
                                    <MenuItem value="delete">{t('actionDelete')}</MenuItem>
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel id="import-validation-label">{t('validationStrategy')}</InputLabel>
                                <Select
                                    labelId="import-validation-label"
                                    label={t('validationStrategy')}
                                    value={data.validation_strategy}
                                    onChange={(e) => setData('validation_strategy', e.target.value)}
                                >
                                    <MenuItem value="skip_errors">{t('validationStrategySkip')}</MenuItem>
                                    <MenuItem value="stop_on_errors">{t('validationStrategyStop')}</MenuItem>
                                </Select>
                            </FormControl>

                            <TextField
                                label={t('allowedErrors')}
                                type="number"
                                fullWidth
                                value={data.allowed_errors}
                                onChange={(e) => setData('allowed_errors', Number(e.target.value))}
                                error={Boolean(errors.allowed_errors)}
                                helperText={errors.allowed_errors}
                            />

                            <FormControl fullWidth>
                                <InputLabel id="import-format-label">{t('fileFormat')}</InputLabel>
                                <Select
                                    labelId="import-format-label"
                                    label={t('fileFormat')}
                                    value={data.file_format}
                                    onChange={(e) => setData('file_format', e.target.value)}
                                >
                                    <MenuItem value="csv">CSV</MenuItem>
                                    <MenuItem value="xls">XLS</MenuItem>
                                    <MenuItem value="xlsx">XLSX</MenuItem>
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
                        </Stack>
                    </Paper>
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {tCatalog('correctHighlightedFields')}
                    </Alert>
                )}
            </Box>
        </AppLayout>
    );
}
