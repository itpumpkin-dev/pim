import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Input } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

import { MasterFormPage } from '../master-crud';

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
            <MasterFormPage
                title={t('createCurrency')}
                backHref="/catalog/currencies"
                processing={processing}
                onSubmit={submit}
                errors={errors}
                maxWidth={560}
            >
                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('currencyCode')}
                        htmlFor="cur-code"
                        valueState={valueStateOf(errors.code)}
                        message={errors.code}
                        hint={t('currencyCodeHelperText')}
                    >
                        <Input
                            id="cur-code"
                            value={data.code}
                            valueState={ui5ValueState(valueStateOf(errors.code))}
                            onInput={(e) => setData('code', e.target.value.toUpperCase())}
                        />
                    </FioriField>

                    <FioriField
                        label={t('currencyExchangeRate')}
                        htmlFor="cur-exchange-rate"
                        valueState={valueStateOf(errors.exchange_rate)}
                        message={errors.exchange_rate}
                        hint={t('currencyExchangeRateHelperText')}
                    >
                        <Input
                            id="cur-exchange-rate"
                            type="Number"
                            value={data.exchange_rate}
                            valueState={ui5ValueState(valueStateOf(errors.exchange_rate))}
                            onInput={(e) => setData('exchange_rate', e.target.value)}
                        />
                    </FioriField>
                </FioriFormGroup>

                <LocaleLabelFields
                    title={t('currencyName')}
                    description={t('nameHelperText')}
                    values={data.translations}
                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                />
            </MasterFormPage>
        </AppLayout>
    );
}
