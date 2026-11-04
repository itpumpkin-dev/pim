import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/upload.js';
import { Button, CheckBox, FileUploader, Input, Option, Select, TextArea } from '@ui5/webcomponents-react';
import { FormEvent, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { MasterFormPage, masterStyles } from '../master-crud';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

interface Props {
    categories: { id: number; name: string }[];
    subcategories: { id: number; name: string; parent_id: number }[];
    businessTypes: { id: number; name: string }[];
    defaultCategoryId: number | null;
    defaultSubcategoryId: number | null;
}

export default function ProductGroupCreate({
    categories = [],
    subcategories = [],
    businessTypes = [],
    defaultCategoryId = null,
    defaultSubcategoryId = null,
}: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productGroups'), href: '/catalog/product-groups' },
        { title: t('createProductGroup'), href: '/catalog/product-groups/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        is_ai_translate: true as boolean,
        code: '',
        description: '',
        category_id: (defaultCategoryId ?? '') as number | '',
        subcategory_id: (defaultSubcategoryId ?? '') as number | '',
        business_type_id: '' as number | '',
        thumbnail: null as File | null,
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const subcategoryOptions = useMemo(
        () => (data.category_id === '' ? [] : subcategories.filter((s) => s.parent_id === data.category_id)),
        [subcategories, data.category_id],
    );

    const submit = (event: FormEvent) => {
        event.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/product-groups', {
            onSuccess: () => router.visit('/catalog/product-groups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createProductGroup')} />
            <MasterFormPage
                title={t('createProductGroup')}
                backHref="/catalog/product-groups"
                processing={processing}
                onSubmit={submit}
                errors={errors}
            >
                <LocaleLabelFields
                    title={t('productGroupName')}
                    description={t('nameHelperText')}
                    values={data.translations}
                    onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                />

                <FioriFormGroup title={t('generalTitle')}>
                    <FioriField
                        label={t('code')}
                        htmlFor="pg-code"
                        valueState={valueStateOf(errors.code)}
                        message={errors.code}
                        hint={t('categoryCodeHelperText')}
                    >
                        <Input
                            id="pg-code"
                            value={data.code}
                            onInput={(e) => setData('code', e.target.value)}
                            valueState={ui5ValueState(valueStateOf(errors.code))}
                        />
                    </FioriField>

                    <FioriField label={t('category')} valueState={valueStateOf(errors.category_id)} message={errors.category_id}>
                        <Select
                            id="pg-category"
                            value={data.category_id === '' ? '' : String(data.category_id)}
                            onChange={(e) => {
                                const next = (e.detail.selectedOption.value ?? '') === '' ? '' : Number(e.detail.selectedOption.value ?? '');
                                setData((prev) => ({ ...prev, category_id: next, subcategory_id: '' }));
                            }}
                        >
                            <Option value="">{t('selectCategory')}</Option>
                            {categories.map((c) => (
                                <Option key={c.id} value={String(c.id)}>
                                    {c.name}
                                </Option>
                            ))}
                        </Select>
                    </FioriField>

                    <FioriField label={t('subcategory')} valueState={valueStateOf(errors.subcategory_id)} message={errors.subcategory_id}>
                        <Select
                            id="pg-subcategory"
                            disabled={data.category_id === ''}
                            value={data.subcategory_id === '' ? '' : String(data.subcategory_id)}
                            onChange={(e) =>
                                setData(
                                    'subcategory_id',
                                    (e.detail.selectedOption.value ?? '') === '' ? '' : Number(e.detail.selectedOption.value ?? ''),
                                )
                            }
                        >
                            <Option value="">{data.category_id === '' ? t('selectCategoryFirst') : t('selectSubcategory')}</Option>
                            {subcategoryOptions.map((s) => (
                                <Option key={s.id} value={String(s.id)}>
                                    {s.name}
                                </Option>
                            ))}
                        </Select>
                    </FioriField>

                    <FioriField label={t('businessTypeName')} valueState={valueStateOf(errors.business_type_id)} message={errors.business_type_id}>
                        <Select
                            id="pg-business-type"
                            value={data.business_type_id === '' ? '' : String(data.business_type_id)}
                            onChange={(e) =>
                                setData(
                                    'business_type_id',
                                    (e.detail.selectedOption.value ?? '') === '' ? '' : Number(e.detail.selectedOption.value ?? ''),
                                )
                            }
                        >
                            <Option value="">{t('selectBusinessType')}</Option>
                            {businessTypes.map((b) => (
                                <Option key={b.id} value={String(b.id)}>
                                    {b.name}
                                </Option>
                            ))}
                        </Select>
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

                    <FioriField label={t('thumbnail')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                        <div className={masterStyles.inlineRow}>
                            <FileUploader hideInput accept="image/*" onChange={(e) => setData('thumbnail', e.detail.files?.[0] ?? null)}>
                                <Button icon="upload">{t('chooseFile')}</Button>
                            </FileUploader>
                            {data.thumbnail && <span className={masterStyles.muted}>{data.thumbnail.name}</span>}
                        </div>
                    </FioriField>

                    <FioriField label="">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <CheckBox
                                text={t('aiTranslate')}
                                checked={data.is_ai_translate}
                                onChange={(e) => setData('is_ai_translate', e.target.checked)}
                            />
                            <CheckBox text={t('active')} checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />
                        </div>
                    </FioriField>
                </FioriFormGroup>
            </MasterFormPage>
        </AppLayout>
    );
}
