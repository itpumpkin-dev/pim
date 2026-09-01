import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

const PRICE_TERMS = ['C&F', 'CIF', 'CNF', 'FOB', 'TNV', 'TVAT'];

interface CurrencyOption {
    id: number;
    code: string;
    name: string;
}

interface VendorData {
    id: number;
    code: string;
    name: string;
    name_en: string | null;
    short_name: string | null;
    vendor_group: 'domestic' | 'foreign' | null;
    tax_id: string | null;
    branch: string | null;
    tax_invoice_address_1: string | null;
    tax_invoice_address_2: string | null;
    tax_invoice_address_3: string | null;
    tax_invoice_address_4: string | null;
    currency_id: number | null;
    payment_terms: string | null;
    default_price_term: string | null;
    remark: string | null;
    contact_name: string | null;
    contact_position: string | null;
    contact_phone: string | null;
    contact_fax: string | null;
    contact_email: string | null;
    contact_address_1: string | null;
    contact_address_2: string | null;
    contact_address_3: string | null;
    contact_address_4: string | null;
    contact_country: string | null;
    is_active: boolean;
}

interface Props {
    vendor: VendorData;
    currencies: CurrencyOption[];
}

export default function VendorEdit({ vendor, currencies }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('vendors'), href: '/catalog/vendors' },
        { title: t('editVendor'), href: '#' },
    ];

    const { data, setData, put, processing, errors, isDirty } = useForm({
        code: vendor.code ?? '',
        name: vendor.name ?? '',
        name_en: vendor.name_en ?? '',
        short_name: vendor.short_name ?? '',
        vendor_group: (vendor.vendor_group ?? '') as '' | 'domestic' | 'foreign',
        tax_id: vendor.tax_id ?? '',
        branch: vendor.branch ?? '',
        tax_invoice_address_1: vendor.tax_invoice_address_1 ?? '',
        tax_invoice_address_2: vendor.tax_invoice_address_2 ?? '',
        tax_invoice_address_3: vendor.tax_invoice_address_3 ?? '',
        tax_invoice_address_4: vendor.tax_invoice_address_4 ?? '',
        currency_id: (vendor.currency_id ?? '') as number | '',
        payment_terms: vendor.payment_terms ?? '',
        default_price_term: vendor.default_price_term ?? '',
        remark: vendor.remark ?? '',
        contact_name: vendor.contact_name ?? '',
        contact_position: vendor.contact_position ?? '',
        contact_phone: vendor.contact_phone ?? '',
        contact_fax: vendor.contact_fax ?? '',
        contact_email: vendor.contact_email ?? '',
        contact_address_1: vendor.contact_address_1 ?? '',
        contact_address_2: vendor.contact_address_2 ?? '',
        contact_address_3: vendor.contact_address_3 ?? '',
        contact_address_4: vendor.contact_address_4 ?? '',
        contact_country: vendor.contact_country ?? '',
        is_active: Boolean(vendor.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/vendors/${vendor.id}`, {
            onSuccess: () => router.visit('/catalog/vendors', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editVendor')}: ${vendor.name}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('editVendor')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/vendors" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <FioriFormGroup title={t('vendorDetailsTitle')}>
                        <FioriField label={t('vendorCode')} htmlFor="v-code" valueState={valueStateOf(errors.code)} message={errors.code}>
                            <TextField id="v-code" fullWidth size="small" value={data.code} onChange={(e) => setData('code', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.code))} />
                        </FioriField>

                        <FioriField label={t('vendorName')} htmlFor="v-name" valueState={valueStateOf(errors.name)} message={errors.name}>
                            <TextField id="v-name" fullWidth size="small" value={data.name} onChange={(e) => setData('name', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.name))} />
                        </FioriField>

                        <FioriField label={t('vendorNameEn')} htmlFor="v-name-en" valueState={valueStateOf(errors.name_en)} message={errors.name_en}>
                            <TextField id="v-name-en" fullWidth size="small" value={data.name_en} onChange={(e) => setData('name_en', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.name_en))} />
                        </FioriField>

                        <FioriField label={t('vendorShortName')} htmlFor="v-short-name" valueState={valueStateOf(errors.short_name)} message={errors.short_name}>
                            <TextField id="v-short-name" fullWidth size="small" value={data.short_name} onChange={(e) => setData('short_name', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.short_name))} />
                        </FioriField>

                        <FioriField label={t('vendorGroup')} valueState={valueStateOf(errors.vendor_group)} message={errors.vendor_group}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.vendor_group))}>
                                <Select displayEmpty value={data.vendor_group} onChange={(e) => setData('vendor_group', e.target.value as 'domestic' | 'foreign')}>
                                    <MenuItem value="">{t('selectOption')}</MenuItem>
                                    <MenuItem value="domestic">{t('vendorGroupDomestic')}</MenuItem>
                                    <MenuItem value="foreign">{t('vendorGroupForeign')}</MenuItem>
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField label={t('vendorTaxId')} htmlFor="v-tax-id" valueState={valueStateOf(errors.tax_id)} message={errors.tax_id}>
                            <TextField id="v-tax-id" fullWidth size="small" value={data.tax_id} onChange={(e) => setData('tax_id', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.tax_id))} />
                        </FioriField>

                        <FioriField label={t('vendorBranch')} htmlFor="v-branch" valueState={valueStateOf(errors.branch)} message={errors.branch}>
                            <TextField id="v-branch" fullWidth size="small" value={data.branch} onChange={(e) => setData('branch', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.branch))} />
                        </FioriField>

                        <FioriField label={t('taxInvoiceAddress')} valueState={valueStateOf(errors.tax_invoice_address_1)} message={errors.tax_invoice_address_1} fullWidth>
                            <Stack spacing={1}>
                                <TextField
                                    fullWidth size="small" placeholder={t('taxInvoiceAddressLine1')}
                                    value={data.tax_invoice_address_1} onChange={(e) => setData('tax_invoice_address_1', e.target.value)}
                                    sx={fioriFieldStateSx(valueStateOf(errors.tax_invoice_address_1))}
                                />
                                <TextField
                                    fullWidth size="small" placeholder={t('taxInvoiceAddressLine2')}
                                    value={data.tax_invoice_address_2} onChange={(e) => setData('tax_invoice_address_2', e.target.value)}
                                    sx={fioriFieldStateSx(valueStateOf(errors.tax_invoice_address_2))}
                                />
                                <TextField
                                    fullWidth size="small" placeholder={t('taxInvoiceAddressLine3')}
                                    value={data.tax_invoice_address_3} onChange={(e) => setData('tax_invoice_address_3', e.target.value)}
                                    sx={fioriFieldStateSx(valueStateOf(errors.tax_invoice_address_3))}
                                />
                                <TextField
                                    fullWidth size="small" placeholder={t('taxInvoiceAddressLine4')}
                                    value={data.tax_invoice_address_4} onChange={(e) => setData('tax_invoice_address_4', e.target.value)}
                                    sx={fioriFieldStateSx(valueStateOf(errors.tax_invoice_address_4))}
                                />
                            </Stack>
                        </FioriField>

                        <FioriField label={t('mainCurrency')} valueState={valueStateOf(errors.currency_id)} message={errors.currency_id}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.currency_id))}>
                                <Select
                                    displayEmpty
                                    value={data.currency_id === '' ? '' : String(data.currency_id)}
                                    onChange={(e) => setData('currency_id', e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <MenuItem value="">{t('selectOption')}</MenuItem>
                                    {currencies.map((c) => (
                                        <MenuItem key={c.id} value={String(c.id)}>{c.code} — {c.name}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField label={t('paymentTerms')} htmlFor="v-payment-terms" valueState={valueStateOf(errors.payment_terms)} message={errors.payment_terms}>
                            <TextField id="v-payment-terms" fullWidth size="small" value={data.payment_terms} onChange={(e) => setData('payment_terms', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.payment_terms))} />
                        </FioriField>

                        <FioriField label={t('defaultPriceTerm')} valueState={valueStateOf(errors.default_price_term)} message={errors.default_price_term}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.default_price_term))}>
                                <Select displayEmpty value={data.default_price_term} onChange={(e) => setData('default_price_term', e.target.value)}>
                                    <MenuItem value="">{t('selectOption')}</MenuItem>
                                    {PRICE_TERMS.map((term) => (
                                        <MenuItem key={term} value={term}>{term}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField label={t('remark')} htmlFor="v-remark" valueState={valueStateOf(errors.remark)} message={errors.remark}>
                            <TextField id="v-remark" fullWidth size="small" value={data.remark} onChange={(e) => setData('remark', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.remark))} />
                        </FioriField>

                        <FioriField label="">
                            <FormControlLabel
                                control={<Checkbox checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                                label={t('active')}
                            />
                        </FioriField>
                    </FioriFormGroup>

                    <FioriFormGroup title={t('contactInfoTitle')}>
                        <FioriField label={t('contactName')} htmlFor="v-contact-name" valueState={valueStateOf(errors.contact_name)} message={errors.contact_name}>
                            <TextField id="v-contact-name" fullWidth size="small" value={data.contact_name} onChange={(e) => setData('contact_name', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_name))} />
                        </FioriField>

                        <FioriField label={t('contactPosition')} htmlFor="v-contact-position" valueState={valueStateOf(errors.contact_position)} message={errors.contact_position}>
                            <TextField id="v-contact-position" fullWidth size="small" value={data.contact_position} onChange={(e) => setData('contact_position', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_position))} />
                        </FioriField>

                        <FioriField label={t('contactPhone')} htmlFor="v-contact-phone" valueState={valueStateOf(errors.contact_phone)} message={errors.contact_phone}>
                            <TextField id="v-contact-phone" fullWidth size="small" value={data.contact_phone} onChange={(e) => setData('contact_phone', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_phone))} />
                        </FioriField>

                        <FioriField label={t('contactFax')} htmlFor="v-contact-fax" valueState={valueStateOf(errors.contact_fax)} message={errors.contact_fax}>
                            <TextField id="v-contact-fax" fullWidth size="small" value={data.contact_fax} onChange={(e) => setData('contact_fax', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_fax))} />
                        </FioriField>

                        <FioriField label={t('contactEmail')} htmlFor="v-contact-email" valueState={valueStateOf(errors.contact_email)} message={errors.contact_email}>
                            <TextField id="v-contact-email" type="email" fullWidth size="small" value={data.contact_email} onChange={(e) => setData('contact_email', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_email))} />
                        </FioriField>

                        <FioriField label={t('contactAddress')} htmlFor="v-contact-address-1" valueState={valueStateOf(errors.contact_address_1)} message={errors.contact_address_1}>
                            <TextField id="v-contact-address-1" fullWidth size="small" placeholder={t('contactAddressLine1')} value={data.contact_address_1} onChange={(e) => setData('contact_address_1', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_address_1))} />
                        </FioriField>

                        <FioriField label={t('contactDistrict')} htmlFor="v-contact-address-2" valueState={valueStateOf(errors.contact_address_2)} message={errors.contact_address_2}>
                            <TextField id="v-contact-address-2" fullWidth size="small" placeholder={t('contactAddressLine2')} value={data.contact_address_2} onChange={(e) => setData('contact_address_2', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_address_2))} />
                        </FioriField>

                        <FioriField label={t('contactAmphoe')} htmlFor="v-contact-address-3" valueState={valueStateOf(errors.contact_address_3)} message={errors.contact_address_3}>
                            <TextField id="v-contact-address-3" fullWidth size="small" placeholder={t('contactAddressLine3')} value={data.contact_address_3} onChange={(e) => setData('contact_address_3', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_address_3))} />
                        </FioriField>

                        <FioriField label={t('contactProvince')} htmlFor="v-contact-address-4" valueState={valueStateOf(errors.contact_address_4)} message={errors.contact_address_4}>
                            <TextField id="v-contact-address-4" fullWidth size="small" placeholder={t('contactAddressLine4')} value={data.contact_address_4} onChange={(e) => setData('contact_address_4', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_address_4))} />
                        </FioriField>

                        <FioriField label={t('contactCountry')} htmlFor="v-contact-country" valueState={valueStateOf(errors.contact_country)} message={errors.contact_country}>
                            <TextField id="v-contact-country" fullWidth size="small" value={data.contact_country} onChange={(e) => setData('contact_country', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.contact_country))} />
                        </FioriField>
                    </FioriFormGroup>
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
            </Box>
        </AppLayout>
    );
}
