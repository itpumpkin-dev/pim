import AppLayout from '@/layouts/app-layout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionIcon from '@mui/icons-material/Description';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Collapse,
    FormControl,
    FormControlLabel,
    FormHelperText,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Typography,
} from '@mui/material';
import { DragEvent, FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AttributeFamilyOption {
    code: string;
    name: string;
}

interface Props {
    families: AttributeFamilyOption[];
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mirrors WooCommerceConversionController::convert()'s 'file' => 'max:38912'
// (38912 KB = 38MB) — checked client-side so a too-large file is rejected
// immediately instead of after uploading tens of MB just to have the server
// say no.
const MAX_FILE_SIZE_MB = 38;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Click-to-browse (native <label> + hidden input) and drag-and-drop share
 * one drop target so users aren't forced to hunt for a tiny "choose file"
 * button — the whole box is the target either way.
 */
function FileDropzone({
    file,
    onSelect,
    label,
    hint,
    error,
}: {
    file: File | null;
    onSelect: (file: File | null) => void;
    label: string;
    hint?: string;
    error?: string;
}) {
    const [dragging, setDragging] = useState(false);

    const handleDrop = (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) {
            onSelect(dropped);
        }
    };

    if (file) {
        return (
            <Paper
                variant="outlined"
                sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderColor: 'success.main', bgcolor: 'action.hover' }}
            >
                <DescriptionIcon color="success" />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{file.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatFileSize(file.size)}</Typography>
                </Box>
                <IconButton size="small" onClick={() => onSelect(null)} aria-label="remove">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </Paper>
        );
    }

    return (
        <Box>
            <Box
                component="label"
                onDragOver={(e: DragEvent<HTMLElement>) => {
                    e.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    p: 3,
                    border: '2px dashed',
                    borderColor: dragging ? 'primary.main' : 'divider',
                    borderRadius: 2,
                    bgcolor: dragging ? 'action.hover' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'border-color 0.15s, background-color 0.15s',
                    '&:hover': { borderColor: 'primary.main' },
                }}
            >
                <CloudUploadIcon color={dragging ? 'primary' : 'action'} sx={{ fontSize: 32 }} />
                <Typography variant="body2" fontWeight={600}>{label}</Typography>
                {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
                <input type="file" hidden accept=".csv" onChange={(e) => onSelect(e.target.files?.[0] ?? null)} />
            </Box>
            {error && <FormHelperText error>{error}</FormHelperText>}
        </Box>
    );
}

export default function WooConvertCreate({ families }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tCatalog } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('wooConvertTitle'), href: '/import-export/woo-convert' },
        { title: t('wooConvertNewConversion'), href: '/import-export/woo-convert/create' },
    ];

    const { data, setData, post, processing, errors, setError, clearErrors, isDirty } = useForm({
        file: null as File | null,
        category_map: null as File | null,
        family_code: '',
        emit_name: true,
        emit_description: true,
        strip_html: true,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const [advancedOpen, setAdvancedOpen] = useState(false);
    const advancedErrorCount = ['category_map', 'family_code'].filter((key) => errors[key as keyof typeof errors]).length;

    const selectFile = (file: File | null) => {
        if (file && file.size > MAX_FILE_SIZE_BYTES) {
            setData('file', null);
            setError('file', t('wooConvertFileTooLarge', { size: formatFileSize(file.size) }));
            return;
        }
        clearErrors('file');
        setData('file', file);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/import-export/woo-convert', {
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('wooConvertTitle')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 720, mx: 'auto' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('wooConvertTitle')}</Typography>
                    <Button component={Link} href="/import-export/woo-convert" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                        {tCatalog('back')}
                    </Button>
                </Stack>

                <Alert severity="info" sx={{ mb: 3, whiteSpace: 'pre-line' }}>
                    {t('wooConvertIntro')}
                </Alert>

                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('wooConvertFileSectionTitle')}</Typography>
                        <FileDropzone
                            file={data.file}
                            onSelect={selectFile}
                            label={t('wooConvertDropzoneLabel')}
                            hint={t('wooConvertFileHelp')}
                            error={errors.file}
                        />
                    </Paper>

                    <Box>
                        <Button
                            onClick={() => setAdvancedOpen((v) => !v)}
                            endIcon={<ExpandMoreIcon sx={{ transform: advancedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
                            sx={{ textTransform: 'none', color: 'text.secondary' }}
                        >
                            {t('wooConvertAdvancedOptions')}
                        </Button>

                        <Collapse in={advancedOpen || advancedErrorCount > 0} timeout="auto" unmountOnExit>
                            <Stack spacing={2} sx={{ mt: 1 }}>
                                <Paper variant="outlined" sx={{ p: 3 }}>
                                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('wooConvertCategorySectionTitle')}</Typography>
                                    <Stack spacing={2}>
                                        <Typography variant="body2" color="text.secondary">{t('wooConvertCategoryHelp')}</Typography>
                                        <FileDropzone
                                            file={data.category_map}
                                            onSelect={(file) => setData('category_map', file)}
                                            label={t('wooConvertCategoryMapChoose')}
                                            error={errors.category_map}
                                        />
                                    </Stack>
                                </Paper>

                                <Paper variant="outlined" sx={{ p: 3 }}>
                                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('wooConvertFamilySectionTitle')}</Typography>
                                    <FormControl fullWidth>
                                        <InputLabel id="woo-convert-family-label">{t('wooConvertFamilyCode')}</InputLabel>
                                        <Select
                                            labelId="woo-convert-family-label"
                                            label={t('wooConvertFamilyCode')}
                                            value={data.family_code}
                                            onChange={(e) => setData('family_code', e.target.value)}
                                        >
                                            <MenuItem value=""><em>{t('wooConvertFamilyCodeNone')}</em></MenuItem>
                                            {families.map((family) => (
                                                <MenuItem key={family.code} value={family.code}>{family.name} ({family.code})</MenuItem>
                                            ))}
                                        </Select>
                                        <FormHelperText>{t('wooConvertFamilyCodeHelp')}</FormHelperText>
                                    </FormControl>
                                </Paper>

                                <Paper variant="outlined" sx={{ p: 3 }}>
                                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('wooConvertOptionsSectionTitle')}</Typography>
                                    <Stack spacing={1}>
                                        <FormControlLabel
                                            control={<Checkbox checked={data.emit_name} onChange={(e) => setData('emit_name', e.target.checked)} />}
                                            label={t('wooConvertEmitName')}
                                        />
                                        <FormControlLabel
                                            control={<Checkbox checked={data.emit_description} onChange={(e) => setData('emit_description', e.target.checked)} />}
                                            label={t('wooConvertEmitDescription')}
                                        />
                                        <FormControlLabel
                                            control={<Checkbox checked={data.strip_html} onChange={(e) => setData('strip_html', e.target.checked)} />}
                                            label={t('wooConvertStripHtml')}
                                        />
                                        {(data.emit_name || data.emit_description) && (
                                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                                                {t('wooConvertLocaleCaveat')}
                                            </Typography>
                                        )}
                                    </Stack>
                                </Paper>
                            </Stack>
                        </Collapse>
                    </Box>
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {tCatalog('correctHighlightedFields')}
                    </Alert>
                )}

                <Button
                    type="submit"
                    fullWidth
                    size="large"
                    sx={{ color: 'white', mt: 3 }}
                    variant="contained"
                    disabled={processing || !data.file}
                    startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                >
                    {processing ? t('wooConvertSubmitting') : t('wooConvertSubmit')}
                </Button>
            </Box>
        </AppLayout>
    );
}
