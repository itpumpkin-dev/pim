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

export default function BusinessTypeCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('businessTypes'), href: '/catalog/business-types' },
        { title: t('createBusinessType'), href: '/catalog/business-types/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        description: '',
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/business-types', {
            onSuccess: () => router.visit('/catalog/business-types', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createBusinessType')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 620, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('createBusinessType')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/business-types" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2} sx={{ mb: 2 }}>
                    <LocaleLabelFields
                        title={t('businessTypeName')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />
                </Stack>

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('description')} htmlFor="bt-description" valueState={valueStateOf(errors.description)} message={errors.description} fullWidth>
                        <TextField
                            id="bt-description"
                            fullWidth
                            size="small"
                            multiline
                            rows={4}
                            value={data.description}
                            onChange={(e) => setData('description', e.target.value)}
                            sx={fioriFieldStateSx(valueStateOf(errors.description))}
                        />
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
