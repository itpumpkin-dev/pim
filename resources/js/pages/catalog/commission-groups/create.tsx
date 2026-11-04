import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckBox, DatePicker, Input, Label, TextArea } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

import { MasterFormPage, masterStyles } from '../master-crud';

export default function CommissionGroupCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('commissionGroups'), href: '/catalog/commission-groups' },
        { title: t('createCommissionGroup'), href: '/catalog/commission-groups/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        code: '',
        p_group_name: '',
        divisor_start: '0' as string,
        divisor_secondary: '0' as string,
        start_date: '',
        end_date: '',
        is_active: true as boolean,
        remark: '',
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/commission-groups', {
            onSuccess: () => router.visit('/catalog/commission-groups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createCommissionGroup')} />
            <MasterFormPage
                title={t('createCommissionGroup')}
                backHref="/catalog/commission-groups"
                processing={processing}
                onSubmit={submit}
                errors={errors}
                maxWidth={620}
            >
                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('commissionGroupCode')} htmlFor="cg-code" valueState={valueStateOf(errors.code)} message={errors.code}>
                        <Input
                            id="cg-code"
                            value={data.code}
                            valueState={ui5ValueState(valueStateOf(errors.code))}
                            onInput={(e) => setData('code', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('commissionGroupName')}
                        htmlFor="cg-name"
                        valueState={valueStateOf(errors.p_group_name)}
                        message={errors.p_group_name}
                    >
                        <Input
                            id="cg-name"
                            value={data.p_group_name}
                            valueState={ui5ValueState(valueStateOf(errors.p_group_name))}
                            onInput={(e) => setData('p_group_name', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('divisorStart')}
                        htmlFor="cg-div-start"
                        valueState={valueStateOf(errors.divisor_start)}
                        message={errors.divisor_start}
                    >
                        <Input
                            id="cg-div-start"
                            type="Number"
                            value={data.divisor_start}
                            valueState={ui5ValueState(valueStateOf(errors.divisor_start))}
                            onInput={(e) => setData('divisor_start', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('divisorSecondary')}
                        htmlFor="cg-div-sec"
                        valueState={valueStateOf(errors.divisor_secondary)}
                        message={errors.divisor_secondary}
                    >
                        <Input
                            id="cg-div-sec"
                            type="Number"
                            value={data.divisor_secondary}
                            valueState={ui5ValueState(valueStateOf(errors.divisor_secondary))}
                            onInput={(e) => setData('divisor_secondary', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('pointPeriod')}
                        valueState={valueStateOf(errors.start_date || errors.end_date)}
                        message={errors.start_date || errors.end_date}
                        hint={t('pointPeriodHelperText')}
                        fullWidth
                    >
                        <div className={masterStyles.inlineRow}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 12rem' }}>
                                <Label for="cg-start-date" showColon={false}>
                                    {t('pointStartDate')}
                                </Label>
                                <DatePicker
                                    id="cg-start-date"
                                    style={{ width: '100%' }}
                                    valueFormat="yyyy-MM-dd"
                                    value={data.start_date}
                                    valueState={ui5ValueState(valueStateOf(errors.start_date))}
                                    onChange={(e) => setData('start_date', e.detail.value)}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 12rem' }}>
                                <Label for="cg-end-date" showColon={false}>
                                    {t('pointEndDate')}
                                </Label>
                                <DatePicker
                                    id="cg-end-date"
                                    style={{ width: '100%' }}
                                    valueFormat="yyyy-MM-dd"
                                    value={data.end_date}
                                    valueState={ui5ValueState(valueStateOf(errors.end_date))}
                                    onChange={(e) => setData('end_date', e.detail.value)}
                                />
                            </div>
                        </div>
                    </FioriField>

                    <FioriField label={t('remark')} htmlFor="cg-remark" valueState={valueStateOf(errors.remark)} message={errors.remark} fullWidth>
                        <TextArea
                            id="cg-remark"
                            rows={3}
                            value={data.remark}
                            valueState={ui5ValueState(valueStateOf(errors.remark))}
                            onInput={(e) => setData('remark', e.target.value)}
                        />
                    </FioriField>

                    <FioriField label="">
                        <CheckBox text={t('active')} checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />
                    </FioriField>
                </FioriFormGroup>
            </MasterFormPage>
        </AppLayout>
    );
}
