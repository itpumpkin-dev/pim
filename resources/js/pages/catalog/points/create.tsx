import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

export default function PointCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('points'), href: '/catalog/points' },
        { title: t('createPoint'), href: '/catalog/points/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        point_type: '',
        point_ratio: '' as string,
        start_date: '',
        end_date: '',
        is_active: true as boolean,
        remark: '',
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/points', {
            onSuccess: () => router.visit('/catalog/points', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createPoint')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 560, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('createPoint')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/points" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('pointType')} htmlFor="point-type" valueState={valueStateOf(errors.point_type)} message={errors.point_type}>
                        <TextField
                            id="point-type"
                            fullWidth
                            size="small"
                            value={data.point_type}
                            onChange={(e) => setData('point_type', e.target.value)}
                            sx={fioriFieldStateSx(valueStateOf(errors.point_type))}
                        />
                    </FioriField>

                    <FioriField label={t('pointRatio')} htmlFor="point-ratio" valueState={valueStateOf(errors.point_ratio)} message={errors.point_ratio}>
                        <TextField
                            id="point-ratio"
                            fullWidth
                            size="small"
                            type="number"
                            inputProps={{ step: '0.01', min: 0 }}
                            value={data.point_ratio}
                            onChange={(e) => setData('point_ratio', e.target.value)}
                            sx={fioriFieldStateSx(valueStateOf(errors.point_ratio))}
                        />
                    </FioriField>

                    <FioriField
                        label={t('pointPeriod')}
                        valueState={valueStateOf(errors.start_date || errors.end_date)}
                        message={errors.start_date || errors.end_date}
                        hint={t('pointPeriodHelperText')}
                        fullWidth
                    >
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                            <TextField
                                id="point-start-date"
                                type="date"
                                fullWidth
                                size="small"
                                label={t('pointStartDate')}
                                InputLabelProps={{ shrink: true }}
                                value={data.start_date}
                                onChange={(e) => setData('start_date', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.start_date))}
                            />
                            <TextField
                                id="point-end-date"
                                type="date"
                                fullWidth
                                size="small"
                                label={t('pointEndDate')}
                                InputLabelProps={{ shrink: true }}
                                value={data.end_date}
                                onChange={(e) => setData('end_date', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.end_date))}
                            />
                        </Stack>
                    </FioriField>

                    <FioriField label={t('remark')} htmlFor="point-remark" valueState={valueStateOf(errors.remark)} message={errors.remark} fullWidth>
                        <TextField
                            id="point-remark"
                            fullWidth
                            size="small"
                            multiline
                            rows={3}
                            value={data.remark}
                            onChange={(e) => setData('remark', e.target.value)}
                            sx={fioriFieldStateSx(valueStateOf(errors.remark))}
                        />
                    </FioriField>

                    <FioriField label="">
                        <FormControlLabel
                            control={<Checkbox checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                            label={t('active')}
                        />
                    </FioriField>
                </FioriFormGroup>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 560 }} />
            </Box>
        </AppLayout>
    );
}
