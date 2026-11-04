import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckBox, TextArea } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

import { MasterFormPage } from '../master-crud';

interface BusinessTypeData {
    id: number;
    name: string;
    description: string | null;
    is_active: boolean;
}

interface Props {
    businessType: BusinessTypeData;
    translations: Record<string, string>;
}

export default function BusinessTypeEdit({ businessType, translations }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('businessTypes'), href: '/catalog/business-types' },
        { title: t('editBusinessType'), href: '#' },
    ];

    const { data, setData, put, processing, errors, isDirty } = useForm({
        translations: translations || ({} as Record<string, string>),
        description: businessType.description ?? '',
        is_active: Boolean(businessType.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/business-types/${businessType.id}`, {
            onSuccess: () => router.visit('/catalog/business-types', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editBusinessType')}: ${businessType.name}`} />
            <MasterFormPage
                title={t('editBusinessType')}
                backHref="/catalog/business-types"
                processing={processing}
                onSubmit={submit}
                errors={errors}
                maxWidth={620}
            >
                <LocaleLabelFields
                    title={t('businessTypeName')}
                    description={t('nameHelperText')}
                    values={data.translations}
                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                />

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('description')}
                        htmlFor="bt-description"
                        valueState={valueStateOf(errors.description)}
                        message={errors.description}
                        fullWidth
                    >
                        <TextArea
                            id="bt-description"
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
