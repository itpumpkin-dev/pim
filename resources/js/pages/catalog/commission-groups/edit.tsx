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

interface CommissionGroupData {
    id: number;
    code: string;
    p_group_name: string | null;
    divisor_start: string | number;
    divisor_secondary: string | number;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    remark: string | null;
}

interface Props {
    commissionGroup: CommissionGroupData;
}

export default function CommissionGroupEdit({ commissionGroup }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('commissionGroups'), href: '/catalog/commission-groups' },
        { title: t('editCommissionGroup'), href: '#' },
    ];

    const { data, setData, put, processing, errors, isDirty } = useForm({
        code: commissionGroup.code ?? '',
        p_group_name: commissionGroup.p_group_name ?? '',
        divisor_start: String(commissionGroup.divisor_start ?? '0'),
        divisor_secondary: String(commissionGroup.divisor_secondary ?? '0'),
        start_date: commissionGroup.start_date ?? '',
        end_date: commissionGroup.end_date ?? '',
        is_active: Boolean(commissionGroup.is_active),
        remark: commissionGroup.remark ?? '',
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/commission-groups/${commissionGroup.id}`, {
            onSuccess: () => router.visit('/catalog/commission-groups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editCommissionGroup')}: ${commissionGroup.code}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 720, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('editCommissionGroup')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/commission-groups" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('commissionGroupCode')} htmlFor="cg-code" valueState={valueStateOf(errors.code)} message={errors.code}>
                        <TextField id="cg-code" fullWidth size="small" value={data.code} onChange={(e) => setData('code', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.code))} />
                    </FioriField>

                    <FioriField label={t('commissionGroupName')} htmlFor="cg-name" valueState={valueStateOf(errors.p_group_name)} message={errors.p_group_name}>
                        <TextField id="cg-name" fullWidth size="small" value={data.p_group_name} onChange={(e) => setData('p_group_name', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.p_group_name))} />
                    </FioriField>

                    <FioriField label={t('divisorStart')} htmlFor="cg-div-start" valueState={valueStateOf(errors.divisor_start)} message={errors.divisor_start}>
                        <TextField
                            id="cg-div-start"
                            fullWidth
                            size="small"
                            type="number"
                            inputProps={{ step: '0.01', min: 0 }}
                            value={data.divisor_start}
                            onChange={(e) => setData('divisor_start', e.target.value)}
                            sx={fioriFieldStateSx(valueStateOf(errors.divisor_start))}
                        />
                    </FioriField>

                    <FioriField label={t('divisorSecondary')} htmlFor="cg-div-sec" valueState={valueStateOf(errors.divisor_secondary)} message={errors.divisor_secondary}>
                        <TextField
                            id="cg-div-sec"
                            fullWidth
                            size="small"
                            type="number"
                            inputProps={{ step: '0.01', min: 0 }}
                            value={data.divisor_secondary}
                            onChange={(e) => setData('divisor_secondary', e.target.value)}
                            sx={fioriFieldStateSx(valueStateOf(errors.divisor_secondary))}
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
                                id="cg-start-date"
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
                                id="cg-end-date"
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

                    <FioriField label={t('remark')} htmlFor="cg-remark" valueState={valueStateOf(errors.remark)} message={errors.remark} fullWidth>
                        <TextField
                            id="cg-remark"
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

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 620 }} />
            </Box>
        </AppLayout>
    );
}
