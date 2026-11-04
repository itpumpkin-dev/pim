import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckBox, DatePicker, Input, TextArea } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterFormPage, masterStyles } from '../master-crud';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

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
            <MasterFormPage
                title={t('createProductGrade')}
                backHref="/catalog/product-grades"
                processing={processing}
                onSubmit={submit}
                errors={errors}
            >
                <LocaleLabelFields
                    title={t('productGradeName')}
                    description={t('nameHelperText')}
                    values={data.translations}
                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                />

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('productGradeCode')}
                        htmlFor="pg-code"
                        valueState={valueStateOf(errors.code)}
                        message={errors.code}
                        hint={t('productGradeCodeHelperText')}
                    >
                        <Input
                            id="pg-code"
                            value={data.code}
                            onInput={(e) => setData('code', e.target.value.toUpperCase())}
                            valueState={ui5ValueState(valueStateOf(errors.code))}
                        />
                    </FioriField>

                    <FioriField
                        label={t('description')}
                        htmlFor="pg-description"
                        valueState={valueStateOf(errors.description)}
                        message={errors.description}
                        fullWidth
                    >
                        <TextArea
                            id="pg-description"
                            rows={4}
                            value={data.description}
                            onInput={(e) => setData('description', e.target.value)}
                            valueState={ui5ValueState(valueStateOf(errors.description))}
                        />
                    </FioriField>

                    <FioriField
                        label={t('gradePeriod')}
                        valueState={valueStateOf(errors.start_date || errors.end_date)}
                        message={errors.start_date || errors.end_date}
                        hint={t('gradePeriodHelperText')}
                        fullWidth
                    >
                        <div className={masterStyles.twoCol}>
                            <DatePicker
                                id="pg-start-date"
                                placeholder={t('gradeStartDate')}
                                accessibleName={t('gradeStartDate')}
                                valueFormat="yyyy-MM-dd"
                                value={data.start_date}
                                onChange={(e) => setData('start_date', e.detail.value)}
                                valueState={ui5ValueState(valueStateOf(errors.start_date))}
                            />
                            <DatePicker
                                id="pg-end-date"
                                placeholder={t('gradeEndDate')}
                                accessibleName={t('gradeEndDate')}
                                valueFormat="yyyy-MM-dd"
                                value={data.end_date}
                                onChange={(e) => setData('end_date', e.detail.value)}
                                valueState={ui5ValueState(valueStateOf(errors.end_date))}
                            />
                        </div>
                    </FioriField>

                    <FioriField label="">
                        <CheckBox text={t('active')} checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />
                    </FioriField>
                </FioriFormGroup>
            </MasterFormPage>
        </AppLayout>
    );
}
