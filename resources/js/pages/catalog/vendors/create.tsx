import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckBox, Input, Option, Select } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

import { MasterFormPage } from '../master-crud';

const PRICE_TERMS = ['C&F', 'CIF', 'CNF', 'FOB', 'TNV', 'TVAT'];

interface CurrencyOption {
    id: number;
    code: string;
    name: string;
}

interface Props {
    currencies: CurrencyOption[];
}

export default function VendorCreate({ currencies }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('vendors'), href: '/catalog/vendors' },
        { title: t('createVendor'), href: '/catalog/vendors/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        code: '',
        translations: {} as Record<string, string>,
        short_name: '',
        vendor_group: '' as '' | 'domestic' | 'foreign',
        tax_id: '',
        branch: '',
        tax_invoice_address_1: '',
        tax_invoice_address_2: '',
        tax_invoice_address_3: '',
        tax_invoice_address_4: '',
        currency_id: '' as number | '',
        payment_terms: '',
        default_price_term: '' as string,
        remark: '',
        contact_name: '',
        contact_position: '',
        contact_phone: '',
        contact_fax: '',
        contact_email: '',
        contact_address_1: '',
        contact_address_2: '',
        contact_address_3: '',
        contact_address_4: '',
        contact_country: '',
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/vendors', {
            onSuccess: () => router.visit('/catalog/vendors', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createVendor')} />
            <MasterFormPage title={t('createVendor')} backHref="/catalog/vendors" processing={processing} onSubmit={submit} errors={errors}>
                <LocaleLabelFields
                    title={t('vendorName')}
                    description={t('nameHelperText')}
                    values={data.translations}
                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                />

                <FioriFormGroup title={t('vendorDetailsTitle')}>
                    <FioriField label={t('vendorCode')} htmlFor="v-code" valueState={valueStateOf(errors.code)} message={errors.code}>
                        <Input
                            id="v-code"
                            value={data.code}
                            valueState={ui5ValueState(valueStateOf(errors.code))}
                            onInput={(e) => setData('code', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('vendorShortName')}
                        htmlFor="v-short-name"
                        valueState={valueStateOf(errors.short_name)}
                        message={errors.short_name}
                    >
                        <Input
                            id="v-short-name"
                            value={data.short_name}
                            valueState={ui5ValueState(valueStateOf(errors.short_name))}
                            onInput={(e) => setData('short_name', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('vendorGroup')}
                        htmlFor="v-vendor-group"
                        valueState={valueStateOf(errors.vendor_group)}
                        message={errors.vendor_group}
                    >
                        <Select
                            id="v-vendor-group"
                            value={data.vendor_group}
                            valueState={ui5ValueState(valueStateOf(errors.vendor_group))}
                            onChange={(e) => setData('vendor_group', (e.detail.selectedOption.value ?? '') as '' | 'domestic' | 'foreign')}
                        >
                            <Option value="">{t('selectOption')}</Option>
                            <Option value="domestic">{t('vendorGroupDomestic')}</Option>
                            <Option value="foreign">{t('vendorGroupForeign')}</Option>
                        </Select>
                    </FioriField>

                    <FioriField label={t('vendorTaxId')} htmlFor="v-tax-id" valueState={valueStateOf(errors.tax_id)} message={errors.tax_id}>
                        <Input
                            id="v-tax-id"
                            value={data.tax_id}
                            valueState={ui5ValueState(valueStateOf(errors.tax_id))}
                            onInput={(e) => setData('tax_id', e.target.value)}
                        />
                    </FioriField>

                    <FioriField label={t('vendorBranch')} htmlFor="v-branch" valueState={valueStateOf(errors.branch)} message={errors.branch}>
                        <Input
                            id="v-branch"
                            value={data.branch}
                            valueState={ui5ValueState(valueStateOf(errors.branch))}
                            onInput={(e) => setData('branch', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('taxInvoiceAddress')}
                        valueState={valueStateOf(errors.tax_invoice_address_1)}
                        message={errors.tax_invoice_address_1}
                        fullWidth
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <Input
                                placeholder={t('taxInvoiceAddressLine1')}
                                accessibleName={t('taxInvoiceAddressLine1')}
                                value={data.tax_invoice_address_1}
                                valueState={ui5ValueState(valueStateOf(errors.tax_invoice_address_1))}
                                onInput={(e) => setData('tax_invoice_address_1', e.target.value)}
                            />
                            <Input
                                placeholder={t('taxInvoiceAddressLine2')}
                                accessibleName={t('taxInvoiceAddressLine2')}
                                value={data.tax_invoice_address_2}
                                valueState={ui5ValueState(valueStateOf(errors.tax_invoice_address_2))}
                                onInput={(e) => setData('tax_invoice_address_2', e.target.value)}
                            />
                            <Input
                                placeholder={t('taxInvoiceAddressLine3')}
                                accessibleName={t('taxInvoiceAddressLine3')}
                                value={data.tax_invoice_address_3}
                                valueState={ui5ValueState(valueStateOf(errors.tax_invoice_address_3))}
                                onInput={(e) => setData('tax_invoice_address_3', e.target.value)}
                            />
                            <Input
                                placeholder={t('taxInvoiceAddressLine4')}
                                accessibleName={t('taxInvoiceAddressLine4')}
                                value={data.tax_invoice_address_4}
                                valueState={ui5ValueState(valueStateOf(errors.tax_invoice_address_4))}
                                onInput={(e) => setData('tax_invoice_address_4', e.target.value)}
                            />
                        </div>
                    </FioriField>

                    <FioriField
                        label={t('mainCurrency')}
                        htmlFor="v-currency"
                        valueState={valueStateOf(errors.currency_id)}
                        message={errors.currency_id}
                    >
                        <Select
                            id="v-currency"
                            value={data.currency_id === '' ? '' : String(data.currency_id)}
                            valueState={ui5ValueState(valueStateOf(errors.currency_id))}
                            onChange={(e) => {
                                const value = e.detail.selectedOption.value ?? '';
                                setData('currency_id', value === '' ? '' : Number(value));
                            }}
                        >
                            <Option value="">{t('selectOption')}</Option>
                            {currencies.map((c) => (
                                <Option key={c.id} value={String(c.id)}>
                                    {c.code} — {c.name}
                                </Option>
                            ))}
                        </Select>
                    </FioriField>

                    <FioriField
                        label={t('paymentTerms')}
                        htmlFor="v-payment-terms"
                        valueState={valueStateOf(errors.payment_terms)}
                        message={errors.payment_terms}
                    >
                        <Input
                            id="v-payment-terms"
                            value={data.payment_terms}
                            valueState={ui5ValueState(valueStateOf(errors.payment_terms))}
                            onInput={(e) => setData('payment_terms', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('defaultPriceTerm')}
                        htmlFor="v-price-term"
                        valueState={valueStateOf(errors.default_price_term)}
                        message={errors.default_price_term}
                    >
                        <Select
                            id="v-price-term"
                            value={data.default_price_term}
                            valueState={ui5ValueState(valueStateOf(errors.default_price_term))}
                            onChange={(e) => setData('default_price_term', e.detail.selectedOption.value ?? '')}
                        >
                            <Option value="">{t('selectOption')}</Option>
                            {PRICE_TERMS.map((term) => (
                                <Option key={term} value={term}>
                                    {term}
                                </Option>
                            ))}
                        </Select>
                    </FioriField>

                    <FioriField label={t('remark')} htmlFor="v-remark" valueState={valueStateOf(errors.remark)} message={errors.remark}>
                        <Input
                            id="v-remark"
                            value={data.remark}
                            valueState={ui5ValueState(valueStateOf(errors.remark))}
                            onInput={(e) => setData('remark', e.target.value)}
                        />
                    </FioriField>

                    <FioriField label="">
                        <CheckBox text={t('active')} checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />
                    </FioriField>
                </FioriFormGroup>

                <FioriFormGroup title={t('contactInfoTitle')}>
                    <FioriField
                        label={t('contactName')}
                        htmlFor="v-contact-name"
                        valueState={valueStateOf(errors.contact_name)}
                        message={errors.contact_name}
                    >
                        <Input
                            id="v-contact-name"
                            value={data.contact_name}
                            valueState={ui5ValueState(valueStateOf(errors.contact_name))}
                            onInput={(e) => setData('contact_name', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactPosition')}
                        htmlFor="v-contact-position"
                        valueState={valueStateOf(errors.contact_position)}
                        message={errors.contact_position}
                    >
                        <Input
                            id="v-contact-position"
                            value={data.contact_position}
                            valueState={ui5ValueState(valueStateOf(errors.contact_position))}
                            onInput={(e) => setData('contact_position', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactPhone')}
                        htmlFor="v-contact-phone"
                        valueState={valueStateOf(errors.contact_phone)}
                        message={errors.contact_phone}
                    >
                        <Input
                            id="v-contact-phone"
                            value={data.contact_phone}
                            valueState={ui5ValueState(valueStateOf(errors.contact_phone))}
                            onInput={(e) => setData('contact_phone', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactFax')}
                        htmlFor="v-contact-fax"
                        valueState={valueStateOf(errors.contact_fax)}
                        message={errors.contact_fax}
                    >
                        <Input
                            id="v-contact-fax"
                            value={data.contact_fax}
                            valueState={ui5ValueState(valueStateOf(errors.contact_fax))}
                            onInput={(e) => setData('contact_fax', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactEmail')}
                        htmlFor="v-contact-email"
                        valueState={valueStateOf(errors.contact_email)}
                        message={errors.contact_email}
                    >
                        <Input
                            id="v-contact-email"
                            type="Email"
                            value={data.contact_email}
                            valueState={ui5ValueState(valueStateOf(errors.contact_email))}
                            onInput={(e) => setData('contact_email', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactAddress')}
                        htmlFor="v-contact-address-1"
                        valueState={valueStateOf(errors.contact_address_1)}
                        message={errors.contact_address_1}
                        hint={t('contactAddressLine1')}
                    >
                        <Input
                            id="v-contact-address-1"
                            placeholder={t('contactAddressLine1')}
                            value={data.contact_address_1}
                            valueState={ui5ValueState(valueStateOf(errors.contact_address_1))}
                            onInput={(e) => setData('contact_address_1', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactDistrict')}
                        htmlFor="v-contact-address-2"
                        valueState={valueStateOf(errors.contact_address_2)}
                        message={errors.contact_address_2}
                    >
                        <Input
                            id="v-contact-address-2"
                            placeholder={t('contactAddressLine2')}
                            value={data.contact_address_2}
                            valueState={ui5ValueState(valueStateOf(errors.contact_address_2))}
                            onInput={(e) => setData('contact_address_2', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactAmphoe')}
                        htmlFor="v-contact-address-3"
                        valueState={valueStateOf(errors.contact_address_3)}
                        message={errors.contact_address_3}
                    >
                        <Input
                            id="v-contact-address-3"
                            placeholder={t('contactAddressLine3')}
                            value={data.contact_address_3}
                            valueState={ui5ValueState(valueStateOf(errors.contact_address_3))}
                            onInput={(e) => setData('contact_address_3', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactProvince')}
                        htmlFor="v-contact-address-4"
                        valueState={valueStateOf(errors.contact_address_4)}
                        message={errors.contact_address_4}
                    >
                        <Input
                            id="v-contact-address-4"
                            placeholder={t('contactAddressLine4')}
                            value={data.contact_address_4}
                            valueState={ui5ValueState(valueStateOf(errors.contact_address_4))}
                            onInput={(e) => setData('contact_address_4', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('contactCountry')}
                        htmlFor="v-contact-country"
                        valueState={valueStateOf(errors.contact_country)}
                        message={errors.contact_country}
                    >
                        <Input
                            id="v-contact-country"
                            value={data.contact_country}
                            valueState={ui5ValueState(valueStateOf(errors.contact_country))}
                            onInput={(e) => setData('contact_country', e.target.value)}
                        />
                    </FioriField>
                </FioriFormGroup>
            </MasterFormPage>
        </AppLayout>
    );
}
