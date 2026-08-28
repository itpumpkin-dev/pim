import { FioriFileUploader } from '@/components/fiori-file-uploader';
import ImportPreflight, { type PreflightSchema } from '@/components/import-export/import-preflight';
import WizardSteps, { type WizardStep } from '@/components/import-export/wizard-steps';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { FIORI, fioriCardSx, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    FormControl,
    FormControlLabel,
    FormHelperText,
    InputLabel,
    MenuItem,
    Paper,
    Radio,
    RadioGroup,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
    types: string[];
    requiredColumnsByType: Record<string, string[]>;
    columnLabelsByType: Record<string, Record<string, string>>;
    families: { code: string; name: string }[];
}

type SchemaResponse = PreflightSchema & { sample: { columns: string[]; rows: Record<string, string>[] } };

export default function ImportCreate({ types, requiredColumnsByType, columnLabelsByType, families }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { locales } = usePage<SharedData>().props;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('importsTitle'), href: '/import-export/imports' },
        { title: t('createImport'), href: '/import-export/imports/create' },
    ];

    const { data, setData, post, processing, errors, transform, isDirty, setDefaults } = useForm({
        type: types[0] ?? 'products',
        file_format: 'csv',
        field_separator: ',',
        action: 'create_update',
        validation_strategy: 'skip_errors',
        ai_translate: Boolean(false),
        source_locale: locales.find((l) => l.code === 'th')?.code ?? locales[0]?.code ?? 'th',
        family_code: '',
        allowed_errors: 10,
        image_directory_path: '',
        file: null as File | null,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const isProducts = data.type === 'products';
    const stepKeys = useMemo(() => (isProducts ? ['type', 'language', 'family', 'review', 'upload'] : ['type', 'review', 'upload']), [isProducts]);
    const steps: WizardStep[] = stepKeys.map((key) => ({
        key,
        label: t('wizardStep' + key.charAt(0).toUpperCase() + key.slice(1)),
    }));

    const [activeStep, setActiveStep] = useState(0);
    const [furthest, setFurthest] = useState(0);
    const [activeAction, setActiveAction] = useState<'save' | 'run' | null>(null);
    const [schema, setSchema] = useState<SchemaResponse | null>(null);
    const [schemaLoading, setSchemaLoading] = useState(false);

    const currentKey = stepKeys[Math.min(activeStep, stepKeys.length - 1)];

    // Column schema for the review/upload steps — refetched whenever the type
    // or the chosen family changes so "required fields" and the sample always
    // match the current choices.
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const params = new URLSearchParams();
        if (isProducts && data.family_code) params.set('family', data.family_code);
        setSchemaLoading(true);
        fetch(`/import-export/imports/schema/${data.type}?${params.toString()}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('schema fetch failed'))))
            .then((json: SchemaResponse) => {
                if (active) setSchema(json);
            })
            .catch(() => {
                if (active) setSchema(null);
            })
            .finally(() => {
                if (active) setSchemaLoading(false);
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [data.type, data.family_code, isProducts]);

    const goNext = () => {
        setActiveStep((step) => {
            const next = Math.min(step + 1, stepKeys.length - 1);
            setFurthest((f) => Math.max(f, next));
            return next;
        });
    };
    const goBack = () => setActiveStep((step) => Math.max(0, step - 1));
    const goToStep = (index: number) => {
        if (index <= furthest) setActiveStep(index);
    };

    const changeType = (type: string) => {
        setData('type', type);
        // Downstream choices no longer apply to the new type.
        setFurthest(0);
        setSchema(null);
    };

    const sampleHref = (format: 'csv' | 'xlsx') => {
        const params = new URLSearchParams({ format });
        if (isProducts && data.family_code) params.set('family', data.family_code);
        return `/import-export/imports/sample/${data.type}?${params.toString()}`;
    };

    const requiredCodes = schema?.required ?? requiredColumnsByType[data.type] ?? [];
    const labelFor = (code: string) => schema?.labels[code] ?? columnLabelsByType[data.type]?.[code] ?? code;

    const submitForm = (run: boolean) => {
        setActiveAction(run ? 'run' : 'save');
        if (run) transform((formData) => ({ ...formData, run: true }));
        skipNavigationGuardRef.current = true;
        post('/import-export/imports', {
            onSuccess: () => {
                if (run) setDefaults();
                else router.visit('/import-export/imports', { replace: true });
            },
            onFinish: () => {
                transform((formData) => formData);
                skipNavigationGuardRef.current = false;
                setActiveAction(null);
            },
        });
    };

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (currentKey === 'upload') submitForm(false);
    };

    const isLastStep = activeStep === stepKeys.length - 1;
    // Only block "Next" while the schema is still loading — if the fetch
    // failed outright, let the user proceed and rely on server-side
    // validation when the import runs.
    const nextDisabled = currentKey === 'review' && schemaLoading;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createImport')} />
            <Box component="form" onSubmit={onSubmit} sx={{ p: { xs: 2, md: 4 }, width: '100%', bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ sm: 'center' }}
                    spacing={2}
                    sx={{ mb: 3 }}
                >
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        {t('createImport')}
                    </Typography>
                    <Button component={Link} href="/import-export/imports" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                        {tCatalog('back')}
                    </Button>
                </Stack>

                <Paper elevation={0} sx={{ ...fioriCardSx, p: { xs: 2, md: 3 }, mb: 2 }}>
                    <WizardSteps steps={steps} active={activeStep} furthest={furthest} onStepClick={goToStep} />
                </Paper>

                <Paper elevation={0} sx={{ ...fioriCardSx, p: { xs: 2, md: 3 } }}>
                    {currentKey === 'type' && (
                        <Stack spacing={2}>
                            <Box>
                                <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                    {t('wizardTypeHeading')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                    {t('wizardTypeSubtitle')}
                                </Typography>
                            </Box>
                            <RadioGroup value={data.type} onChange={(e) => changeType(e.target.value)}>
                                <Stack spacing={1.5}>
                                    {types.map((type) => (
                                        <Paper
                                            key={type}
                                            variant="outlined"
                                            onClick={() => changeType(type)}
                                            sx={{
                                                p: 1.5,
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                borderColor: data.type === type ? FIORI.brand : FIORI.border,
                                                bgcolor: data.type === type ? FIORI.brandBg : FIORI.surface,
                                            }}
                                        >
                                            <FormControlLabel
                                                value={type}
                                                control={<Radio />}
                                                label={<Typography sx={{ fontWeight: 600, color: FIORI.textPrimary }}>{typeLabel(type)}</Typography>}
                                                sx={{ m: 0, width: '100%' }}
                                            />
                                        </Paper>
                                    ))}
                                </Stack>
                            </RadioGroup>
                        </Stack>
                    )}

                    {currentKey === 'language' && (
                        <Stack spacing={2}>
                            <Box>
                                <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                    {t('wizardLanguageHeading')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                    {t('wizardLanguageSubtitle')}
                                </Typography>
                            </Box>
                            <FormControl fullWidth>
                                <InputLabel id="import-source-locale-label">{t('sourceLocaleLabel')}</InputLabel>
                                <Select
                                    labelId="import-source-locale-label"
                                    label={t('sourceLocaleLabel')}
                                    value={data.source_locale}
                                    onChange={(e) => setData('source_locale', e.target.value)}
                                >
                                    {locales.map((l) => (
                                        <MenuItem key={l.code} value={l.code}>
                                            {l.display_name ?? l.code}
                                        </MenuItem>
                                    ))}
                                </Select>
                                <FormHelperText>{t('sourceLocaleHelp')}</FormHelperText>
                            </FormControl>
                        </Stack>
                    )}

                    {currentKey === 'family' && (
                        <Stack spacing={2}>
                            <Box>
                                <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                    {t('wizardFamilyHeading')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                    {t('wizardFamilySubtitle')}
                                </Typography>
                            </Box>
                            <FormControl fullWidth>
                                <InputLabel id="import-family-label">{t('wizardStepFamily')}</InputLabel>
                                <Select
                                    labelId="import-family-label"
                                    label={t('wizardStepFamily')}
                                    value={data.family_code}
                                    onChange={(e) => setData('family_code', e.target.value)}
                                >
                                    <MenuItem value="">
                                        <em>{t('wizardFamilyAll')}</em>
                                    </MenuItem>
                                    {families.map((f) => (
                                        <MenuItem key={f.code} value={f.code}>
                                            {f.name} ({f.code})
                                        </MenuItem>
                                    ))}
                                </Select>
                                <FormHelperText>{t('wizardFamilyHelp')}</FormHelperText>
                            </FormControl>
                        </Stack>
                    )}

                    {currentKey === 'review' && (
                        <Stack spacing={2.5}>
                            <Box>
                                <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                    {t('wizardReviewHeading')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                    {t('wizardReviewSubtitle')}
                                </Typography>
                            </Box>

                            {schemaLoading && !schema ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={16} />
                                    <Typography variant="body2" color="text.secondary">
                                        {t('previewLoading')}
                                    </Typography>
                                </Stack>
                            ) : (
                                <>
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: FIORI.textPrimary }}>
                                            {t('wizardRequiredAttributes')}
                                        </Typography>
                                        {requiredCodes.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary">
                                                {t('wizardNoRequired')}
                                            </Typography>
                                        ) : (
                                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                                {requiredCodes.map((code) => (
                                                    <Chip
                                                        key={code}
                                                        label={labelFor(code)}
                                                        size="small"
                                                        sx={{ bgcolor: FIORI.brandBg, color: FIORI.brandDark, fontWeight: 600, borderRadius: '6px' }}
                                                    />
                                                ))}
                                            </Stack>
                                        )}
                                    </Box>

                                    {schema && schema.columns.length > 0 && (
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: FIORI.textPrimary }}>
                                                {t('wizardAllColumns')}
                                            </Typography>
                                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                                {schema.columns.map((code) => (
                                                    <Chip
                                                        key={code}
                                                        label={labelFor(code)}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{
                                                            borderColor: requiredCodes.includes(code) ? FIORI.brand : FIORI.borderStrong,
                                                            color: FIORI.textPrimary,
                                                            borderRadius: '6px',
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    {schema && schema.sample.columns.length > 0 && (
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: FIORI.textPrimary }}>
                                                {t('filePreview')}
                                            </Typography>
                                            <Box sx={{ overflowX: 'auto', border: `1px solid ${FIORI.border}`, borderRadius: '8px' }}>
                                                <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8125rem' }}>
                                                    <Box component="thead" sx={{ bgcolor: FIORI.headerBg }}>
                                                        <Box component="tr">
                                                            {schema.sample.columns.map((col) => (
                                                                <Box
                                                                    component="th"
                                                                    key={col}
                                                                    sx={{
                                                                        textAlign: 'left',
                                                                        whiteSpace: 'nowrap',
                                                                        p: 1,
                                                                        fontWeight: 600,
                                                                        color: FIORI.textPrimary,
                                                                        borderBottom: `1px solid ${FIORI.border}`,
                                                                    }}
                                                                >
                                                                    {col}
                                                                </Box>
                                                            ))}
                                                        </Box>
                                                    </Box>
                                                    <Box component="tbody">
                                                        <Box component="tr">
                                                            {schema.sample.columns.map((col) => (
                                                                <Box
                                                                    component="td"
                                                                    key={col}
                                                                    sx={{ whiteSpace: 'nowrap', p: 1, color: FIORI.textPrimary }}
                                                                >
                                                                    {schema.sample.rows[0]?.[col] ?? ''}
                                                                </Box>
                                                            ))}
                                                        </Box>
                                                    </Box>
                                                </Box>
                                            </Box>
                                        </Box>
                                    )}

                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            component="a"
                                            href={sampleHref('csv')}
                                            variant="outlined"
                                            startIcon={<DownloadIcon />}
                                            sx={fioriDefaultSx}
                                        >
                                            {t('downloadSample')} · CSV
                                        </Button>
                                        <Button
                                            component="a"
                                            href={sampleHref('xlsx')}
                                            variant="outlined"
                                            startIcon={<DownloadIcon />}
                                            sx={fioriDefaultSx}
                                        >
                                            {t('downloadSample')} · XLSX
                                        </Button>
                                    </Stack>
                                </>
                            )}
                        </Stack>
                    )}

                    {currentKey === 'upload' && (
                        <Stack spacing={2.5}>
                            <Box>
                                <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                    {t('wizardUploadHeading')}
                                </Typography>
                                <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                    {t('wizardUploadSubtitle')}
                                </Typography>
                            </Box>

                            <FioriFileUploader
                                files={data.file ? [data.file] : []}
                                onFilesChange={(files) => {
                                    const next = files[0] ?? null;
                                    setData('file', next);
                                    if (next) {
                                        const ext = next.name.toLowerCase().split('.').pop();
                                        setData('file_format', ext === 'xlsx' ? 'xlsx' : ext === 'xls' ? 'xls' : 'csv');
                                    }
                                }}
                                placeholder={t('chooseFile')}
                                accept=".csv,.xls,.xlsx"
                                error={errors.file}
                            />

                            <ImportPreflight file={data.file} fileFormat={data.file_format} fieldSeparator={data.field_separator} schema={schema} />

                            <Accordion
                                elevation={0}
                                disableGutters
                                sx={{ border: `1px solid ${FIORI.border}`, borderRadius: '8px', '&:before': { display: 'none' } }}
                            >
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Typography fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                        {t('wizardAdvancedOptions')}
                                    </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
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

                                        {isProducts && (
                                            <Box>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            checked={data.ai_translate}
                                                            onChange={(e) => setData('ai_translate', e.target.checked)}
                                                        />
                                                    }
                                                    label={t('aiTranslate')}
                                                />
                                                <FormHelperText sx={{ ml: 4, mt: -0.5 }}>{t('aiTranslateHelp')}</FormHelperText>
                                            </Box>
                                        )}

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

                                        {isProducts && (
                                            <TextField
                                                label={t('imageDirectoryPath')}
                                                fullWidth
                                                value={data.image_directory_path}
                                                onChange={(e) => setData('image_directory_path', e.target.value)}
                                                error={Boolean(errors.image_directory_path)}
                                                helperText={errors.image_directory_path}
                                            />
                                        )}
                                    </Stack>
                                </AccordionDetails>
                            </Accordion>
                        </Stack>
                    )}

                    {Object.keys(errors).length > 0 && (
                        <Alert severity="error" sx={{ mt: 2 }}>
                            {tCatalog('correctHighlightedFields')}
                        </Alert>
                    )}

                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 3 }}>
                        <Button onClick={goBack} disabled={activeStep === 0} startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {tCatalog('back')}
                        </Button>

                        {isLastStep ? (
                            <Stack direction="row" spacing={1}>
                                <Button
                                    type="submit"
                                    variant="outlined"
                                    disabled={processing || !data.file}
                                    startIcon={activeAction === 'save' ? <CircularProgress size={16} /> : <SaveIcon />}
                                    sx={fioriDefaultSx}
                                >
                                    {activeAction === 'save' ? tCatalog('saving') : tCatalog('save')}
                                </Button>
                                <Button
                                    variant="contained"
                                    disabled={processing || !data.file}
                                    startIcon={activeAction === 'run' ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                                    onClick={() => submitForm(true)}
                                    sx={fioriEmphasizedSx}
                                >
                                    {t('importNow')}
                                </Button>
                            </Stack>
                        ) : (
                            <Button
                                onClick={goNext}
                                disabled={nextDisabled}
                                variant="contained"
                                endIcon={<ArrowForwardIcon />}
                                sx={fioriEmphasizedSx}
                            >
                                {t('wizardNext')}
                            </Button>
                        )}
                    </Stack>
                </Paper>
            </Box>
        </AppLayout>
    );
}
