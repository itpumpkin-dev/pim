import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/upload.js';
import { Button, FileUploader, Input, Option, Select, TextArea } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { MarketplaceBrandPicker } from '@/components/marketplace-brand-picker';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

import { MasterFormPage, masterStyles } from '../master-crud';

interface BrandDetail {
    id: number;
    code: string;
    admin_label: string | null;
    slug: string | null;
    description: string | null;
    parent_id: number | null;
    thumbnail_url: string | null;
    shopee_brand_id: number | null;
    lazada_brand_id: number | null;
    tiktok_brand_id: number | null;
    woocommerce_brand_id: number | null;
}

interface ParentOption {
    id: number;
    name: string | null;
}

interface Props {
    brand: BrandDetail;
    translations: Record<string, string>;
    parentOptions: ParentOption[];
}

export default function BrandEdit({ brand, translations, parentOptions }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('brands'), href: '/catalog/brands' },
        { title: t('editBrand'), href: '#' },
    ];

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        translations: translations || ({} as Record<string, string>),
        slug: brand.slug || '',
        parent_id: (brand.parent_id !== null ? brand.parent_id : '') as string | number,
        description: brand.description || '',
        thumbnail: null as File | null,
        shopee_brand_id: brand.shopee_brand_id,
        lazada_brand_id: brand.lazada_brand_id,
        tiktok_brand_id: brand.tiktok_brand_id,
        woocommerce_brand_id: brand.woocommerce_brand_id,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        // เหตุผลเดียวกับหน้า edit ของ CategoryController ที่ PUT ส่ง multipart ไม่ได้ —
        // พอมีอัปโหลดรูป thumbnail ก็เลยต้องบังคับใช้ multipart แทน
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/brands/${brand.id}`, {
            onSuccess: () => router.visit('/catalog/brands', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editBrand')}: ${brand.admin_label || brand.code}`} />
            <MasterFormPage title={t('editBrand')} backHref="/catalog/brands" processing={processing} onSubmit={submit} errors={errors}>
                <LocaleLabelFields
                    title={t('name')}
                    description={t('nameHelperText')}
                    values={data.translations}
                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                />

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('slug')}
                        htmlFor="brand-slug"
                        valueState={valueStateOf(errors.slug)}
                        message={errors.slug}
                        hint={t('slugHelperText')}
                    >
                        <Input
                            id="brand-slug"
                            value={data.slug}
                            valueState={ui5ValueState(valueStateOf(errors.slug))}
                            onInput={(e) => setData('slug', e.target.value)}
                        />
                    </FioriField>

                    <FioriField
                        label={t('parentBrand')}
                        htmlFor="brand-parent"
                        valueState={valueStateOf(errors.parent_id)}
                        message={errors.parent_id}
                        hint={t('parentBrandHelperText')}
                    >
                        <Select
                            id="brand-parent"
                            value={String(data.parent_id)}
                            valueState={ui5ValueState(valueStateOf(errors.parent_id))}
                            onChange={(e) => {
                                const value = e.detail.selectedOption.value ?? '';
                                setData('parent_id', value === '' ? '' : Number(value));
                            }}
                        >
                            <Option value="">{t('noneOption')}</Option>
                            {parentOptions.map((opt) => (
                                <Option key={opt.id} value={String(opt.id)}>
                                    {opt.name}
                                </Option>
                            ))}
                        </Select>
                    </FioriField>

                    <FioriField
                        label={t('description')}
                        htmlFor="brand-description"
                        valueState={valueStateOf(errors.description)}
                        message={errors.description}
                        hint={t('descriptionHelperText')}
                        fullWidth
                    >
                        <TextArea
                            id="brand-description"
                            rows={4}
                            value={data.description}
                            valueState={ui5ValueState(valueStateOf(errors.description))}
                            onInput={(e) => setData('description', e.target.value)}
                        />
                    </FioriField>

                    <FioriField label={t('imageLabel')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                        <div className={masterStyles.inlineRow}>
                            <FileUploader hideInput accept="image/*" onChange={(e) => setData('thumbnail', e.detail.files?.[0] ?? null)}>
                                <Button icon="upload">{t('chooseFile')}</Button>
                            </FileUploader>
                            {data.thumbnail ? (
                                <span className={masterStyles.muted}>{data.thumbnail.name}</span>
                            ) : brand.thumbnail_url ? (
                                <img src={brand.thumbnail_url} alt="" className={masterStyles.thumb} />
                            ) : null}
                        </div>
                    </FioriField>
                </FioriFormGroup>

                <FioriFormGroup title={t('marketplaceBrandTitle')} description={t('marketplaceBrandHelperText')}>
                    <MarketplaceBrandPicker
                        platform="shopee"
                        label={t('shopeeBrandLabel')}
                        value={data.shopee_brand_id}
                        onChange={(id) => setData('shopee_brand_id', id)}
                    />
                    <MarketplaceBrandPicker
                        platform="lazada"
                        label={t('lazadaBrandLabel')}
                        value={data.lazada_brand_id}
                        onChange={(id) => setData('lazada_brand_id', id)}
                    />
                    <MarketplaceBrandPicker
                        platform="tiktok"
                        label={t('tiktokBrandLabel')}
                        value={data.tiktok_brand_id}
                        onChange={(id) => setData('tiktok_brand_id', id)}
                    />
                    <MarketplaceBrandPicker
                        platform="woocommerce"
                        label={t('woocommerceBrandLabel')}
                        value={data.woocommerce_brand_id}
                        onChange={(id) => setData('woocommerce_brand_id', id)}
                    />
                </FioriFormGroup>
            </MasterFormPage>
        </AppLayout>
    );
}
