import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckBox, Input, TextArea } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';

import { MasterFormPage } from '../master-crud';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

export default function BaseUnitCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('baseUnits'), href: '/catalog/base-units' },
        { title: t('addNewBaseUnit'), href: '/catalog/base-units/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        slug: '',
        description: '',
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/base-units', {
            onSuccess: () => router.visit('/catalog/base-units', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('addNewBaseUnit')} />
            <MasterFormPage title={t('addNewBaseUnit')} backHref="/catalog/base-units" processing={processing} onSubmit={submit} errors={errors}>
                <LocaleLabelFields
                    title={t('name')}
                    description={t('nameHelperText')}
                    values={data.translations}
                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                />

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('baseUnitAbbrev')}
                        htmlFor="base-unit-slug"
                        valueState={valueStateOf(errors.slug)}
                        message={errors.slug}
                        hint={t('baseUnitAbbrevHelperText')}
                    >
                        <Input
                            id="base-unit-slug"
                            value={data.slug}
                            valueState={ui5ValueState(valueStateOf(errors.slug))}
                            onInput={(e) => setData('slug', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('description')}
                        htmlFor="base-unit-description"
                        valueState={valueStateOf(errors.description)}
                        message={errors.description}
                        hint={t('descriptionHelperText')}
                        fullWidth
                    >
                        <TextArea
                            id="base-unit-description"
                            rows={4}
                            value={data.description}
                            valueState={ui5ValueState(valueStateOf(errors.description))}
                            onInput={(e) => setData('description', e.target.value)}
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
