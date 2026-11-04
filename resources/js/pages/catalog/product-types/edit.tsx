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

interface ProductTypeData {
    id: number;
    name: string;
    description: string | null;
    is_active: boolean;
}

interface Props {
    productType: ProductTypeData;
    translations: Record<string, string>;
}

export default function ProductTypeEdit({ productType, translations }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productTypes'), href: '/catalog/product-types' },
        { title: t('editProductType'), href: '#' },
    ];

    const { data, setData, put, processing, errors, isDirty } = useForm({
        translations: translations || ({} as Record<string, string>),
        description: productType.description ?? '',
        is_active: Boolean(productType.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/product-types/${productType.id}`, {
            onSuccess: () => router.visit('/catalog/product-types', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editProductType')}: ${productType.name}`} />
            <MasterFormPage
                title={t('editProductType')}
                backHref="/catalog/product-types"
                processing={processing}
                onSubmit={submit}
                errors={errors}
                maxWidth={620}
            >
                <LocaleLabelFields
                    title={t('productTypeName')}
                    description={t('nameHelperText')}
                    values={data.translations}
                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                />

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('description')}
                        htmlFor="pt-description"
                        valueState={valueStateOf(errors.description)}
                        message={errors.description}
                        fullWidth
                    >
                        <TextArea
                            id="pt-description"
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
