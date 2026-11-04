import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, Input, Option, Select, TextArea, Title } from '@ui5/webcomponents-react';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriFileUploader } from '@/components/fiori-file-uploader';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

import styles from '../categories/category-pages.module.css';

interface Props {
    categories: { id: number; name: string }[];
    defaultCategoryId: number | null;
}

export default function SubcategoryCreate({ categories = [], defaultCategoryId = null }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('subCategories'), href: '/catalog/subcategories' },
        { title: t('createSubcategory'), href: '/catalog/subcategories/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm({
        translations: {} as Record<string, string>,
        is_ai_translate: true as boolean,
        code: '',
        description: '',
        category_id: (defaultCategoryId ?? '') as number | '',
        thumbnail: null as File | null,
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/subcategories', {
            onSuccess: () => router.visit('/catalog/subcategories', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createSubcategory')} />
            <form onSubmit={submit} className={styles.formPage}>
                <div className={styles.formHeader}>
                    <Title level="H3" wrappingType="Normal">
                        {t('createSubcategory')}
                    </Title>
                    <div className={styles.actions}>
                        <Button icon="nav-back" onClick={() => router.visit('/catalog/subcategories')}>
                            {t('back')}
                        </Button>
                        <Button design="Emphasized" icon="save" disabled={processing} loading={processing} onClick={() => submit()}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </div>
                </div>

                <div className={styles.formStack}>
                    <LocaleLabelFields
                        title={t('subcategoryName')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('code')}
                            htmlFor="sub-code"
                            valueState={valueStateOf(errors.code)}
                            message={errors.code}
                            hint={t('categoryCodeHelperText')}
                        >
                            <Input
                                id="sub-code"
                                className={styles.fullWidth}
                                value={data.code}
                                valueState={ui5ValueState(valueStateOf(errors.code))}
                                onInput={(e) => setData('code', e.target.value)}
                            />
                        </FioriField>

                        <FioriField
                            label={t('category')}
                            htmlFor="sub-category"
                            valueState={valueStateOf(errors.category_id)}
                            message={errors.category_id}
                        >
                            <Select
                                id="sub-category"
                                className={styles.fullWidth}
                                value={data.category_id === '' ? '' : String(data.category_id)}
                                valueState={ui5ValueState(valueStateOf(errors.category_id))}
                                onChange={(e) => {
                                    const v = e.detail.selectedOption.value ?? '';
                                    setData('category_id', v === '' ? '' : Number(v));
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

                        <FioriField
                            label={t('description')}
                            htmlFor="sub-description"
                            valueState={valueStateOf(errors.description)}
                            message={errors.description}
                            fullWidth
                        >
                            <TextArea
                                id="sub-description"
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
                </div>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} className={styles.errorSummary} />
            </form>
        </AppLayout>
    );
}
