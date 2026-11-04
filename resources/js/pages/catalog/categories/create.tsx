import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, Input, Option, Select, TextArea, Title } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { CategoryFieldInput, type CategoryFieldItem } from '@/components/catalog/category-field-input';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriFileUploader } from '@/components/fiori-file-uploader';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useLocale } from '@/hooks/use-locale';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

import styles from './category-pages.module.css';

interface Props {
    categoryFields: CategoryFieldItem[];
    rootCategories: { id: number; name: string }[];
    defaultParentId: number | null;
}

export default function CategoryCreate({ categoryFields = [], rootCategories = [], defaultParentId = null }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { locales, locale: currentLocaleCode } = useLocale();
    const currentLocaleId = locales.find((l) => l.code === currentLocaleCode)?.id || 1;

    const isSubcategory = defaultParentId != null;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' },
        { title: isSubcategory ? t('createSubcategory') : t('createCategory'), href: '/catalog/categories/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        is_ai_translate: true as boolean,
        code: '',
        description: '',
        parent_id: (defaultParentId ?? '') as number | '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        additional_data: {} as Record<string, any>,
        thumbnail: null as File | null,
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/categories', {
            onSuccess: () => router.visit('/catalog/categories', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={isSubcategory ? t('createSubcategory') : t('createCategory')} />
            <form onSubmit={submit} className={styles.formPage}>
                <div className={styles.formHeader}>
                    <Title level="H3" wrappingType="Normal">
                        {isSubcategory ? t('createSubcategory') : t('createCategory')}
                    </Title>
                    <div className={styles.actions}>
                        <Button icon="nav-back" onClick={() => router.visit('/catalog/categories')}>
                            {t('back')}
                        </Button>
                        <Button design="Emphasized" icon="save" disabled={processing} loading={processing} onClick={() => submit()}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </div>
                </div>

                <div className={styles.formStack}>
                    <LocaleLabelFields
                        title={t('name')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('code')}
                            htmlFor="category-code"
                            valueState={valueStateOf(errors.code)}
                            message={errors.code}
                            hint={t('categoryCodeHelperText')}
                        >
                            <Input
                                id="category-code"
                                className={styles.fullWidth}
                                value={data.code}
                                valueState={ui5ValueState(valueStateOf(errors.code))}
                                onInput={(e) => setData('code', e.target.value)}
                            />
                        </FioriField>

                        <FioriField
                            label={t('parentCategory')}
                            htmlFor="category-parent"
                            valueState={valueStateOf(errors.parent_id)}
                            message={errors.parent_id}
                            hint={t('categoryParentHelperText')}
                        >
                            <Select
                                id="category-parent"
                                className={styles.fullWidth}
                                value={data.parent_id === '' ? '' : String(data.parent_id)}
                                valueState={ui5ValueState(valueStateOf(errors.parent_id))}
                                onChange={(e) => {
                                    const v = e.detail.selectedOption.value ?? '';
                                    setData('parent_id', v === '' ? '' : Number(v));
                                }}
                            >
                                <Option value="">{t('noneRootCategory')}</Option>
                                {rootCategories.map((c) => (
                                    <Option key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>

                        <FioriField
                            label={t('description')}
                            htmlFor="category-description"
                            valueState={valueStateOf(errors.description)}
                            message={errors.description}
                            hint={t('descriptionHelperText')}
                            fullWidth
                        >
                            <TextArea
                                id="category-description"
                                className={styles.fullWidth}
                                rows={4}
                                value={data.description}
                                valueState={ui5ValueState(valueStateOf(errors.description))}
                                onInput={(e) => setData('description', e.target.value)}
                            />
                        </FioriField>

                        <FioriField label={t('thumbnail')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                            <FioriFileUploader
                                placeholder={t('chooseFile')}
                                accept="image/*"
                                valueLabel={data.thumbnail?.name ?? null}
                                onSelect={(files) => setData('thumbnail', files[0] ?? null)}
                            />
                        </FioriField>

                        <FioriField label="">
                            <div className={styles.checkStack}>
                                <CheckBox
                                    text={t('aiTranslate')}
                                    checked={data.is_ai_translate}
                                    onChange={(e) => setData('is_ai_translate', e.target.checked)}
                                />
                                <CheckBox text={t('active')} checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />
                            </div>
                        </FioriField>
                    </FioriFormGroup>

                    {categoryFields.length > 0 && (
                        <FioriFormGroup title="หมวดหมู่แอตทริบิวต์เพิ่มเติม (Dynamic Fields)">
                            {categoryFields.map((field) => {
                                const fieldLabel = field.labels[currentLocaleId] || Object.values(field.labels)[0] || field.code;
                                const fieldValue = data.additional_data[field.code] ?? '';
                                const fieldError = errors[`additional_data.${field.code}` as keyof typeof errors];

                                return (
                                    <FioriField
                                        key={field.id}
                                        label={fieldLabel}
                                        required={field.is_required}
                                        valueState={valueStateOf(fieldError)}
                                        message={fieldError}
                                    >
                                        <CategoryFieldInput
                                            field={field}
                                            value={fieldValue}
                                            onChange={(value) => setData('additional_data', { ...data.additional_data, [field.code]: value })}
                                            error={fieldError}
                                        />
                                    </FioriField>
                                );
                            })}
                        </FioriFormGroup>
                    )}
                </div>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} className={styles.errorSummary} />
            </form>
        </AppLayout>
    );
}
