import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckBox, DatePicker, Input, TextArea } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterFormPage, masterStyles } from '../master-crud';

import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

interface PointData {
    id: number;
    point_type: string;
    point_ratio: string | number;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    remark: string | null;
}

interface Props {
    point: PointData;
}

export default function PointEdit({ point }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('points'), href: '/catalog/points' },
        { title: t('editPoint'), href: '#' },
    ];

    const { data, setData, put, processing, errors, isDirty } = useForm({
        point_type: point.point_type ?? '',
        point_ratio: String(point.point_ratio ?? ''),
        start_date: point.start_date ?? '',
        end_date: point.end_date ?? '',
        is_active: Boolean(point.is_active),
        remark: point.remark ?? '',
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/points/${point.id}`, {
            onSuccess: () => router.visit('/catalog/points', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editPoint')}: ${point.point_type}`} />
            <MasterFormPage title={t('editPoint')} backHref="/catalog/points" processing={processing} onSubmit={submit} errors={errors}>
                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField label={t('pointType')} htmlFor="point-type" valueState={valueStateOf(errors.point_type)} message={errors.point_type}>
                        <Input
                            id="point-type"
                            value={data.point_type}
                            onInput={(e) => setData('point_type', e.target.value)}
                            valueState={ui5ValueState(valueStateOf(errors.point_type))}
                        />
                    </FioriField>

                    <FioriField
                        label={t('pointRatio')}
                        htmlFor="point-ratio"
                        valueState={valueStateOf(errors.point_ratio)}
                        message={errors.point_ratio}
                    >
                        <Input
                            id="point-ratio"
                            type="Number"
                            value={data.point_ratio}
                            onInput={(e) => setData('point_ratio', e.target.value)}
                            valueState={ui5ValueState(valueStateOf(errors.point_ratio))}
                        />
                    </FioriField>

                    <FioriField
                        label={t('pointPeriod')}
                        valueState={valueStateOf(errors.start_date || errors.end_date)}
                        message={errors.start_date || errors.end_date}
                        hint={t('pointPeriodHelperText')}
                        fullWidth
                    >
                        <div className={masterStyles.twoCol}>
                            <DatePicker
                                id="point-start-date"
                                placeholder={t('pointStartDate')}
                                accessibleName={t('pointStartDate')}
                                valueFormat="yyyy-MM-dd"
                                value={data.start_date}
                                onChange={(e) => setData('start_date', e.detail.value)}
                                valueState={ui5ValueState(valueStateOf(errors.start_date))}
                            />
                            <DatePicker
                                id="point-end-date"
                                placeholder={t('pointEndDate')}
                                accessibleName={t('pointEndDate')}
                                valueFormat="yyyy-MM-dd"
                                value={data.end_date}
                                onChange={(e) => setData('end_date', e.detail.value)}
                                valueState={ui5ValueState(valueStateOf(errors.end_date))}
                            />
                        </div>
                    </FioriField>

                    <FioriField label={t('remark')} htmlFor="point-remark" valueState={valueStateOf(errors.remark)} message={errors.remark} fullWidth>
                        <TextArea
                            id="point-remark"
                            rows={3}
                            value={data.remark}
                            onInput={(e) => setData('remark', e.target.value)}
                            valueState={ui5ValueState(valueStateOf(errors.remark))}
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
