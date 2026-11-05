import { HistoryPanel } from '@/components/history-panel';
import AppLayout from '@/layouts/app-layout';
import { DEFAULT_MASTER_THUMBNAIL } from '@/lib/default-thumbnail';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, Input, Option, Select, Tab, TabContainer, Text, TextArea, Title } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CategoryFieldInput, type CategoryFieldItem } from '@/components/catalog/category-field-input';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriFileUploader } from '@/components/fiori-file-uploader';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { useLocale } from '@/hooks/use-locale';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { type CodeEditState, codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { FioriStatus } from '@/lib/fiori-style';

import styles from './category-pages.module.css';

interface CategoryItem {
    id: number;
    code: string;
    name: string;
    slug: string | null;
    display_type: 'default' | 'products' | 'subcategories' | 'both';
    description: string | null;
    is_ai_translate: boolean;
    is_active: boolean;
    parent_id: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_data: Record<string, any> | null;
}

interface SubcategoryItem {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
}

interface Props extends CodeEditState {
    category: CategoryItem;
    thumbnailUrl: string | null;
    translations: Record<string, string>;
    categoryFields: CategoryFieldItem[];
    rootCategories: { id: number; name: string }[];
    subcategories: SubcategoryItem[];
    canViewHistory?: boolean;
}

export default function CategoryEdit({
    category,
    thumbnailUrl,
    translations,
    categoryFields = [],
    rootCategories = [],
    subcategories = [],
    canViewHistory = false,
    canEditCode = false,
    codeLocked = false,
}: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);
    const { locales, locale: currentLocaleCode } = useLocale();
    const currentLocaleId = locales.find((l) => l.code === currentLocaleCode)?.id || 1;

    const isRoot = category.parent_id === null;

    // หน้านี้เป็น editor กลางที่ใช้ซ้ำทั้งกับ root category (ตาราง "ลูก" ด้านล่าง
    // คือหมวดหมู่ย่อยจริงๆ) และ subcategory (ตาราง "ลูก" กลายเป็นกลุ่มสินค้าแทน
    // — ดู CategoryController::edit()) เพราะงั้นตอนที่หน้านี้เปิดอยู่บน subcategory
    // (!isRoot) ปุ่มแก้ไขแต่ละแถวต้องพาไปที่หน้าแก้ไข "กลุ่มสินค้า" โดยตรง
    // (/catalog/product-groups/{id}/edit) ไม่ใช่วนกลับมาที่ /catalog/categories/
    // {id}/edit อีกที (ซึ่งฝั่ง backend จะ redirect ต่อไปที่เดิมอยู่ดี แต่เช็คสิทธิ์
    // ผิด resource — ดู CategoryController::edit()'s ที่เพิ่งแก้ไป) ต้องเช็คสิทธิ์
    // product_groups.edit_product_groups เองแยกต่างหาก คนละ permission กับ
    // categories.edit_categories ที่คุมหน้านี้อยู่
    const { auth } = usePage<SharedData>().props;
    const canEditProductGroups = (auth.permissions || []).includes('product_groups.edit_product_groups');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' },
        { title: t('editCategory'), href: '#' },
    ];

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        code: category.code || '',
        translations: translations || ({} as Record<string, string>),
        is_ai_translate: Boolean(category.is_ai_translate),
        description: category.description || '',
        parent_id: (category.parent_id !== null ? category.parent_id : '') as string | number,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        additional_data: (category.additional_data || {}) as Record<string, any>,
        slug: category.slug || '',
        display_type: category.display_type || 'default',
        thumbnail: null as File | null,
        is_active: Boolean(category.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        // PHP มันไม่รองรับการอ่าน multipart/form-data ตอนเป็น PUT request
        // เลยต้องส่งผ่าน POST แล้วปลอมเป็น _method แทน — เพราะฟิลด์ประเภท Image/File
        // ของหมวดหมู่จะยัด File ดิบๆ ลงใน additional_data ทำให้ request นี้ต้องเป็น multipart
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/categories/${category.id}`, {
            onSuccess: () => router.visit('/catalog/categories', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const editButton = (href: string) => (
        <Button
            design="Transparent"
            icon="edit"
            tooltip={tGrid('rowActions.edit')}
            accessibleName={tGrid('rowActions.edit')}
            onClick={() => router.visit(href)}
        />
    );

    const subcategoryColumns: FioriResponsiveColumn<SubcategoryItem>[] = [
        {
            key: 'status',
            header: t('status'),
            priority: 'always',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        {
            key: 'name',
            header: t('subcategoryNameColumn'),
            priority: 'always',
            render: (row) => <span className={styles.strong}>{row.name}</span>,
        },
        {
            key: 'code',
            header: t('code'),
            priority: 'medium',
            render: (row) => <span className={styles.muted}>{row.code || '-'}</span>,
        },
        {
            key: 'actions',
            header: tGrid('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) =>
                // ไม่ใช่ root -> แถวที่โชว์อยู่คือกลุ่มสินค้า (leaf) จริงๆ ไม่ใช่
                // หมวดหมู่ย่อย — พาไปหน้าแก้ไขกลุ่มสินค้าโดยตรง เช็คสิทธิ์
                // product_groups.edit_product_groups เอง (ไม่ใช่ categories.edit_categories
                // ที่คุมหน้านี้อยู่ — คนละ resource กัน ซ่อนปุ่มไปเลยถ้าไม่มีสิทธิ์
                // แทนที่จะให้กดแล้วไปเจอ 403 เงียบๆ)
                !isRoot
                    ? canEditProductGroups
                        ? editButton(`/catalog/product-groups/${row.id}/edit`)
                        : null
                    : editButton(`/catalog/categories/${row.id}/edit`),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editCategory')}: ${category.code}`} />
            <form onSubmit={submit} className={styles.formPage}>
                {canViewHistory && (
                    <TabContainer
                        collapsed
                        className={styles.tabs}
                        contentBackgroundDesign="Transparent"
                        onTabSelect={(e) => setTabIndex(e.detail.tabIndex)}
                    >
                        <Tab text="General" selected={tabIndex === 0} />
                        <Tab text="History" selected={tabIndex === 1} />
                    </TabContainer>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/categories/${category.id}/history`} />}

                {tabIndex === 0 && (
                    <>
                        <div className={styles.formHeader}>
                            <Title level="H3" wrappingType="Normal">
                                {t('editCategory')}
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
                                    hint={t(codeHintKey({ canEditCode, codeLocked }))}
                                    valueState={valueStateOf(errors.code)}
                                    message={errors.code}
                                >
                                    <Input
                                        id="category-code"
                                        className={styles.fullWidth}
                                        value={data.code}
                                        disabled={!canEditCode}
                                        maxlength={100}
                                        valueState={ui5ValueState(valueStateOf(errors.code))}
                                        onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                                    />
                                </FioriField>

                                <FioriField
                                    label={t('slug')}
                                    htmlFor="category-slug"
                                    valueState={valueStateOf(errors.slug)}
                                    message={errors.slug}
                                    hint={t('slugHelperText')}
                                >
                                    <Input
                                        id="category-slug"
                                        className={styles.fullWidth}
                                        value={data.slug}
                                        valueState={ui5ValueState(valueStateOf(errors.slug))}
                                        onInput={(e) => setData('slug', e.target.value)}
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

                                <FioriField label={t('displayType')} htmlFor="category-display-type">
                                    <Select
                                        id="category-display-type"
                                        className={styles.fullWidth}
                                        value={data.display_type}
                                        onChange={(e) => setData('display_type', e.detail.selectedOption.value as typeof data.display_type)}
                                    >
                                        <Option value="default">{t('displayTypeDefault')}</Option>
                                        <Option value="products">{t('displayTypeProducts')}</Option>
                                        <Option value="subcategories">{t('displayTypeSubcategories')}</Option>
                                        <Option value="both">{t('displayTypeBoth')}</Option>
                                    </Select>
                                </FioriField>

                                <FioriField label={t('thumbnail')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                                    <div className={styles.thumbRow}>
                                        <FioriFileUploader
                                            placeholder={t('chooseFile')}
                                            accept="image/*"
                                            valueLabel={data.thumbnail?.name ?? null}
                                            onSelect={(files) => setData('thumbnail', files[0] ?? null)}
                                        />
                                        {!data.thumbnail && <img src={thumbnailUrl || DEFAULT_MASTER_THUMBNAIL} alt="" className={styles.thumb} />}
                                    </div>
                                </FioriField>

                                <FioriField label="">
                                    <div className={styles.checkStack}>
                                        <CheckBox
                                            text={t('aiTranslate')}
                                            checked={data.is_ai_translate}
                                            onChange={(e) => setData('is_ai_translate', e.target.checked)}
                                        />
                                        <CheckBox
                                            text={t('active')}
                                            checked={data.is_active}
                                            onChange={(e) => setData('is_active', e.target.checked)}
                                        />
                                    </div>
                                </FioriField>
                            </FioriFormGroup>

                            <FioriFormGroup title={t('subcategoriesColumn')}>
                                <div className={styles.subStack}>
                                    {isRoot && (
                                        <Button icon="add" onClick={() => router.visit(`/catalog/categories/create?parent=${category.id}`)}>
                                            {t('createSubcategory')}
                                        </Button>
                                    )}
                                    {subcategories.length > 0 ? (
                                        <FioriResponsiveTable
                                            variant="plain"
                                            size="small"
                                            columns={subcategoryColumns}
                                            rows={subcategories}
                                            getRowKey={(row) => row.id}
                                        />
                                    ) : (
                                        <Text className={styles.muted}>{t('noSubcategories')}</Text>
                                    )}
                                </div>
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
                    </>
                )}
            </form>
        </AppLayout>
    );
}
