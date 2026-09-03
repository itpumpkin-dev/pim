import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

export default function CurrencyCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('currencies'), href: '/catalog/currencies' },
        { title: t('createCurrency'), href: '/catalog/currencies/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        code: '',
        translations: {} as Record<string, string>,
        exchange_rate: '1',
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/currencies', {
            onSuccess: () => router.visit('/catalog/currencies', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createCurrency')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 560, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('createCurrency')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/currencies" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('currencyCode')} htmlFor="cur-code" valueState={valueStateOf(errors.code)} message={errors.code} hint={t('currencyCodeHelperText')}>
                        <TextField
                            id="cur-code"
                            fullWidth
                            size="small"
                            value={data.code}
                            onChange={(e) => setData('code', e.target.value.toUpperCase())}
                            sx={fioriFieldStateSx(valueStateOf(errors.code))}
                        />
                    </FioriField>

                    <FioriField
                        label={t('currencyExchangeRate')}
                        htmlFor="cur-exchange-rate"
                        valueState={valueStateOf(errors.exchange_rate)}
                        message={errors.exchange_rate}
                        hint={t('currencyExchangeRateHelperText')}
                    >
                        <TextField
                            id="cur-exchange-rate"
                            fullWidth
                            size="small"
                            type="number"
                            inputProps={{ step: '0.0001', min: 0 }}
                            value={data.exchange_rate}
                            onChange={(e) => setData('exchange_rate', e.target.value)}
                            sx={fioriFieldStateSx(valueStateOf(errors.exchange_rate))}
                        />
                    </FioriField>
                </FioriFormGroup>

                <Stack sx={{ mt: 2 }}>
                    <LocaleLabelFields
                        title={t('currencyName')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 560 }} />
            </Box>
        </AppLayout>
    );
}
