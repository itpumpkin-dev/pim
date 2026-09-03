import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

export default function ProductGradeCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productGrades'), href: '/catalog/product-grades' },
        { title: t('createProductGrade'), href: '/catalog/product-grades/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        code: '',
        translations: {} as Record<string, string>,
        description: '',
        start_date: '',
        end_date: '',
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/product-grades', {
            onSuccess: () => router.visit('/catalog/product-grades', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createProductGrade')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 620, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('createProductGrade')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/product-grades" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2} sx={{ mb: 2 }}>
                    <LocaleLabelFields
                        title={t('productGradeName')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />
                </Stack>

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('productGradeCode')} htmlFor="pg-code" valueState={valueStateOf(errors.code)} message={errors.code} hint={t('productGradeCodeHelperText')}>
                        <TextField
                            id="pg-code"
                            fullWidth
                            size="small"
                            value={data.code}
                            onChange={(e) => setData('code', e.target.value.toUpperCase())}
                            sx={fioriFieldStateSx(valueStateOf(errors.code))}
                        />
                    </FioriField>

                    <FioriField label={t('description')} htmlFor="pg-description" valueState={valueStateOf(errors.description)} message={errors.description} fullWidth>
                        <TextField
                            id="pg-description"
                            fullWidth
                            size="small"
                            multiline
                            rows={4}
                            value={data.description}
                            onChange={(e) => setData('description', e.target.value)}
                            sx={fioriFieldStateSx(valueStateOf(errors.description))}
                        />
                    </FioriField>

                    <FioriField
                        label={t('gradePeriod')}
                        valueState={valueStateOf(errors.start_date || errors.end_date)}
                        message={errors.start_date || errors.end_date}
                        hint={t('gradePeriodHelperText')}
                        fullWidth
                    >
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                            <TextField
                                id="pg-start-date"
                                type="date"
                                fullWidth
                                size="small"
                                label={t('gradeStartDate')}
                                InputLabelProps={{ shrink: true }}
                                value={data.start_date}
                                onChange={(e) => setData('start_date', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.start_date))}
                            />
                            <TextField
                                id="pg-end-date"
                                type="date"
                                fullWidth
                                size="small"
                                label={t('gradeEndDate')}
                                InputLabelProps={{ shrink: true }}
                                value={data.end_date}
                                onChange={(e) => setData('end_date', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.end_date))}
                            />
                        </Stack>
                    </FioriField>

                    <FioriField label="">
                        <FormControlLabel
                            control={<Checkbox checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                            label={t('active')}
                        />
                    </FioriField>
                </FioriFormGroup>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 620 }} />
            </Box>
        </AppLayout>
    );
}
