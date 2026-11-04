import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/upload.js';
import { Button, FileUploader, Input, Option, Select, TextArea } from '@ui5/webcomponents-react';
import { FormEvent, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

import { MasterFormPage, masterStyles } from '../master-crud';

interface ParentOption {
    id: number;
    name: string | null;
}

interface Props {
    parentOptions: ParentOption[];
}

export default function BrandCreate({ parentOptions }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('brands'), href: '/catalog/brands' },
        { title: t('addNewBrand'), href: '/catalog/brands/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        slug: '',
        parent_id: '' as string | number,
        description: '',
        thumbnail: null as File | null,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);
    const thumbnailPreview = useMemo(() => (data.thumbnail ? URL.createObjectURL(data.thumbnail) : null), [data.thumbnail]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/brands', {
            forceFormData: true,
            onSuccess: () => router.visit('/catalog/brands', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('addNewBrand')} />
            <MasterFormPage title={t('addNewBrand')} backHref="/catalog/brands" processing={processing} onSubmit={submit} errors={errors}>
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
                            {thumbnailPreview ? <img src={thumbnailPreview} alt="" className={masterStyles.thumb} /> : null}
                            {data.thumbnail && <span className={masterStyles.muted}>{data.thumbnail.name}</span>}
                        </div>
                    </FioriField>
                </FioriFormGroup>
            </MasterFormPage>
        </AppLayout>
    );
}
