import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadIcon from '@mui/icons-material/CloudUpload';
import SaveIcon from '@mui/icons-material/Save';
import {
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControl,
    FormControlLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface Props {
    categories: { id: number; name: string }[];
    defaultCategoryId: number | null;
}

export default function SubcategoryCreate({ categories = [], defaultCategoryId = null }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('subCategories'), href: '/catalog/subcategories' },
        { title: t('createSubcategory'), href: '/catalog/subcategories/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        is_ai_translate: true as boolean,
        code: '',
        description: '',
        category_id: (defaultCategoryId ?? '') as number | '',
        thumbnail: null as File | null,
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/subcategories', {
            onSuccess: () => router.visit('/catalog/subcategories', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createSubcategory')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                        {t('createSubcategory')}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/subcategories" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                            sx={fioriEmphasizedSx}
                        >
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <LocaleLabelFields
                        title={t('subcategoryName')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('code')}
                            htmlFor="sub-code"
                            valueState={valueStateOf(errors.code)}
                            message={errors.code}
                            hint={t('categoryCodeHelperText')}
                        >
                            <TextField
                                id="sub-code"
                                fullWidth
                                size="small"
                                value={data.code}
                                onChange={(e) => setData('code', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.code))}
                            />
                        </FioriField>

                        <FioriField label={t('category')} valueState={valueStateOf(errors.category_id)} message={errors.category_id}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.category_id))}>
                                <Select
                                    id="sub-category"
                                    displayEmpty
                                    value={data.category_id === '' ? '' : String(data.category_id)}
                                    onChange={(e) => setData('category_id', e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <MenuItem value="">{t('selectCategory')}</MenuItem>
                                    {categories.map((c) => (
                                        <MenuItem key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField
                            label={t('description')}
                            htmlFor="sub-description"
                            valueState={valueStateOf(errors.description)}
                            message={errors.description}
                            fullWidth
                        >
                            <TextField
                                id="sub-description"
                                fullWidth
                                size="small"
                                multiline
                                rows={4}
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.description))}
                            />
                        </FioriField>

                        <FioriField label={t('thumbnail')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={fioriDefaultSx}>
                                    {t('chooseFile')}
                                    <input type="file" hidden accept="image/*" onChange={(e) => setData('thumbnail', e.target.files?.[0] ?? null)} />
                                </Button>
                                {data.thumbnail && (
                                    <Typography variant="body2" color="text.secondary">
                                        {data.thumbnail.name}
                                    </Typography>
                                )}
                            </Stack>
                        </FioriField>

                        <FioriField label="">
                            <Stack>
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_ai_translate} onChange={(e) => setData('is_ai_translate', e.target.checked)} />}
                                    label={t('aiTranslate')}
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                                    label={t('active')}
                                />
                            </Stack>
                        </FioriField>
                    </FioriFormGroup>
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
            </Box>
        </AppLayout>
    );
}
