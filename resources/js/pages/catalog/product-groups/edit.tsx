import { HistoryPanel } from '@/components/history-panel';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/navigation-down-arrow.js';
import '@ui5/webcomponents-icons/dist/navigation-up-arrow.js';
import '@ui5/webcomponents-icons/dist/upload.js';
import {
    Button,
    CheckBox,
    ComboBox,
    ComboBoxItem,
    FileUploader,
    Input,
    Option,
    Select,
    Tab,
    TabContainer,
    Tag,
    TextArea,
} from '@ui5/webcomponents-react';
import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LazadaCategoryPicker, type LazadaCategoryOption } from '@/components/catalog/lazada-category-picker';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { ShopeeCategoryPicker, type ShopeeCategoryOption } from '@/components/catalog/shopee-category-picker';
import { TikTokCategoryPicker, type TikTokCategoryOption } from '@/components/catalog/tiktok-category-picker';
import { WooCommerceCategoryPicker, type WooCommerceCategoryOption } from '@/components/catalog/woocommerce-category-picker';
import { FioriField, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { codeHintKey, normalizeCodeInput, type CodeEditState } from '@/lib/code-field';

import { MasterFormPage, masterStyles } from '../master-crud';

interface GroupData {
    id: number;
    code: string;
    description: string | null;
    is_active: boolean;
    is_ai_translate: boolean;
    subcategory_id: number | null;
    category_id: number | null;
    business_type_id: number | null;
    lazada_category_id: number | null;
    lazada_category: LazadaCategoryOption | null;
    shopee_category_id: number | null;
    shopee_category: ShopeeCategoryOption | null;
    tiktok_category_id: number | null;
    tiktok_category: TikTokCategoryOption | null;
    woocommerce_category_id: number | null;
    woocommerce_category: WooCommerceCategoryOption | null;
    attribute_families: { id: number; name: string }[];
}

interface Props extends CodeEditState {
    group: GroupData;
    thumbnailUrl: string | null;
    translations: Record<string, string>;
    categories: { id: number; name: string }[];
    subcategories: { id: number; name: string; parent_id: number }[];
    businessTypes: { id: number; name: string }[];
    availableFamilies: { id: number; code: string; name: string }[];
    canViewHistory?: boolean;
}

export default function ProductGroupEdit({
    group,
    thumbnailUrl,
    translations,
    categories = [],
    subcategories = [],
    businessTypes = [],
    availableFamilies = [],
    canViewHistory = false,
    canEditCode = false,
    codeLocked = false,
}: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);
    // bumps after each "add family" pick so the ComboBox remounts empty (it was a value={null} Autocomplete)
    const [familyPickerKey, setFamilyPickerKey] = useState(0);

    const [lazadaCategory, setLazadaCategory] = useState<LazadaCategoryOption | null>(group.lazada_category);
    const [shopeeCategory, setShopeeCategory] = useState<ShopeeCategoryOption | null>(group.shopee_category);
    const [tiktokCategory, setTiktokCategory] = useState<TikTokCategoryOption | null>(group.tiktok_category);
    const [woocommerceCategory, setWoocommerceCategory] = useState<WooCommerceCategoryOption | null>(group.woocommerce_category);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productGroups'), href: '/catalog/product-groups' },
        { title: t('editProductGroup'), href: '#' },
    ];

    const { data, setData, post, transform, processing, errors, isDirty } = useForm({
        translations: translations || ({} as Record<string, string>),
        is_ai_translate: Boolean(group.is_ai_translate),
        code: group.code || '',
        description: group.description || '',
        category_id: (group.category_id ?? '') as number | '',
        subcategory_id: (group.subcategory_id ?? '') as number | '',
        business_type_id: (group.business_type_id ?? '') as number | '',
        family_ids: group.attribute_families.map((f) => f.id) as number[],
        lazada_category_id: group.lazada_category_id,
        shopee_category_id: group.shopee_category_id,
        tiktok_category_id: group.tiktok_category_id,
        woocommerce_category_id: group.woocommerce_category_id,
        thumbnail: null as File | null,
        is_active: Boolean(group.is_active),
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const subcategoryOptions = useMemo(
        () => (data.category_id === '' ? [] : subcategories.filter((s) => s.parent_id === data.category_id)),
        [subcategories, data.category_id],
    );

    // ตระกูลแอตทริบิวต์ที่ผูกไว้ — เก็บแค่ id เรียงตามลำดับใน data.family_ids
    // (ลำดับ = sort_order ที่จะถูกบันทึก) ตัวนี้ map กลับไปหาชื่อ/โค้ดจาก
    // availableFamilies เพื่อ render แถวในลิสต์ด้านล่าง
    const boundFamilies = useMemo(
        () => data.family_ids.map((id) => availableFamilies.find((f) => f.id === id)).filter((f): f is (typeof availableFamilies)[number] => !!f),
        [data.family_ids, availableFamilies],
    );
    const unboundFamilies = useMemo(() => availableFamilies.filter((f) => !data.family_ids.includes(f.id)), [availableFamilies, data.family_ids]);

    const addFamily = (familyId: number) => {
        setData('family_ids', [...data.family_ids, familyId]);
    };

    const removeFamily = (familyId: number) => {
        setData(
            'family_ids',
            data.family_ids.filter((id) => id !== familyId),
        );
    };

    const moveFamily = (index: number, direction: -1 | 1) => {
        const next = [...data.family_ids];
        const target = index + direction;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        setData('family_ids', next);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((formData) => ({ ...formData, _method: 'put' }));
        skipNavigationGuardRef.current = true;
        post(`/catalog/product-groups/${group.id}`, {
            onSuccess: () => router.visit('/catalog/product-groups', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const tabs = canViewHistory ? (
        <TabContainer collapsed style={{ marginBottom: '1.5rem' }} onTabSelect={(e) => setTabIndex(e.detail.tabIndex)}>
            <Tab text="General" selected={tabIndex === 0} />
            <Tab text="History" selected={tabIndex === 1} />
        </TabContainer>
    ) : null;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editProductGroup')}: ${group.code}`} />
            {tabIndex === 1 && canViewHistory && (
                <div className={masterStyles.formPage}>
                    {tabs}
                    <HistoryPanel historyUrl={`/catalog/product-groups/${group.id}/history`} />
                </div>
            )}

            {tabIndex === 0 && (
                <MasterFormPage
                    before={tabs}
                    title={t('editProductGroup')}
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
                            hint={t(codeHintKey({ canEditCode, codeLocked }))}
                            valueState={valueStateOf(errors.code)}
                            message={errors.code}
                        >
                            <Input
                                id="pg-code"
                                value={data.code}
                                disabled={!canEditCode}
                                maxlength={100}
                                valueState={ui5ValueState(valueStateOf(errors.code))}
                                onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                            />
                        </FioriField>

                        <FioriField label={t('category')} valueState={valueStateOf(errors.category_id)} message={errors.category_id}>
                            <Select
                                id="pg-category"
                                value={data.category_id === '' ? '' : String(data.category_id)}
                                valueState={ui5ValueState(valueStateOf(errors.category_id))}
                                onChange={(e) => {
                                    const value = e.detail.selectedOption.value ?? '';
                                    const next = value === '' ? '' : Number(value);
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
                                valueState={ui5ValueState(valueStateOf(errors.subcategory_id))}
                                onChange={(e) => {
                                    const value = e.detail.selectedOption.value ?? '';
                                    setData('subcategory_id', value === '' ? '' : Number(value));
                                }}
                            >
                                <Option value="">{data.category_id === '' ? t('selectCategoryFirst') : t('selectSubcategory')}</Option>
                                {subcategoryOptions.map((s) => (
                                    <Option key={s.id} value={String(s.id)}>
                                        {s.name}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>

                        <FioriField
                            label={t('businessTypeName')}
                            valueState={valueStateOf(errors.business_type_id)}
                            message={errors.business_type_id}
                        >
                            <Select
                                id="pg-business-type"
                                value={data.business_type_id === '' ? '' : String(data.business_type_id)}
                                valueState={ui5ValueState(valueStateOf(errors.business_type_id))}
                                onChange={(e) => {
                                    const value = e.detail.selectedOption.value ?? '';
                                    setData('business_type_id', value === '' ? '' : Number(value));
                                }}
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
                                valueState={ui5ValueState(valueStateOf(errors.description))}
                                onInput={(e) => setData('description', e.target.value)}
                            />
                        </FioriField>

                        <FioriField label={t('thumbnail')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                            <div className={masterStyles.inlineRow}>
                                <FileUploader hideInput accept="image/*" onChange={(e) => setData('thumbnail', e.detail.files?.[0] ?? null)}>
                                    <Button icon="upload">{t('chooseFile')}</Button>
                                </FileUploader>
                                {data.thumbnail ? (
                                    <span className={masterStyles.muted}>{data.thumbnail.name}</span>
                                ) : thumbnailUrl ? (
                                    <img src={thumbnailUrl} alt="" className={masterStyles.thumb} />
                                ) : null}
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

                    <FioriFormGroup title={t('attributeFamily')} description={t('boundAttributeFamiliesHelperText')}>
                        <FioriField label="" valueState={valueStateOf(errors.family_ids)} message={errors.family_ids} fullWidth>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <ComboBox
                                    key={familyPickerKey}
                                    style={{ width: '100%' }}
                                    placeholder={t('addAttributeFamilyPlaceholder')}
                                    onSelectionChange={(e) => {
                                        const id = e.detail.item?.value;
                                        if (!id) return;
                                        addFamily(Number(id));
                                        setFamilyPickerKey((k) => k + 1);
                                    }}
                                >
                                    {unboundFamilies.map((f) => (
                                        <ComboBoxItem key={f.id} value={String(f.id)} text={f.name} />
                                    ))}
                                </ComboBox>

                                {boundFamilies.length === 0 ? (
                                    <span style={{ color: 'var(--sapContent_LabelColor)', fontStyle: 'italic' }}>
                                        {t('noAttributeFamiliesBound')}
                                    </span>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {boundFamilies.map((family, index) => (
                                            <div
                                                key={family.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    padding: '0.25rem 0.5rem 0.25rem 0.75rem',
                                                    border: '1px solid var(--sapGroup_ContentBorderColor)',
                                                    borderRadius: 'var(--sapElement_BorderCornerRadius)',
                                                }}
                                            >
                                                <span style={{ flex: 1, fontWeight: 600 }}>{family.name}</span>
                                                {index === 0 && <Tag design="Information">{t('defaultFamilyBadge')}</Tag>}
                                                <Button
                                                    design="Transparent"
                                                    icon="navigation-up-arrow"
                                                    disabled={index === 0}
                                                    tooltip={t('moveFamilyUp')}
                                                    accessibleName={t('moveFamilyUp')}
                                                    onClick={() => moveFamily(index, -1)}
                                                />
                                                <Button
                                                    design="Transparent"
                                                    icon="navigation-down-arrow"
                                                    disabled={index === boundFamilies.length - 1}
                                                    tooltip={t('moveFamilyDown')}
                                                    accessibleName={t('moveFamilyDown')}
                                                    onClick={() => moveFamily(index, 1)}
                                                />
                                                <Button
                                                    design="Transparent"
                                                    icon="delete"
                                                    tooltip={t('removeFamily')}
                                                    accessibleName={t('removeFamily')}
                                                    onClick={() => removeFamily(family.id)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </FioriField>
                    </FioriFormGroup>

                    <FioriFormGroup title={t('marketplaceCategoryTitle')} description={t('marketplaceCategoryHelperText')}>
                        <FioriField
                            label={t('lazadaCategoryLabel')}
                            valueState={valueStateOf(errors.lazada_category_id)}
                            message={errors.lazada_category_id}
                        >
                            <LazadaCategoryPicker
                                value={lazadaCategory}
                                onChange={(next) => {
                                    setLazadaCategory(next);
                                    setData('lazada_category_id', next?.id ?? null);
                                }}
                                placeholder={t('lazadaCategoryPlaceholder')}
                            />
                        </FioriField>

                        <FioriField
                            label={t('shopeeCategoryLabel')}
                            valueState={valueStateOf(errors.shopee_category_id)}
                            message={errors.shopee_category_id}
                        >
                            <ShopeeCategoryPicker
                                value={shopeeCategory}
                                onChange={(next) => {
                                    setShopeeCategory(next);
                                    setData('shopee_category_id', next?.id ?? null);
                                }}
                                placeholder={t('shopeeCategoryPlaceholder')}
                            />
                        </FioriField>

                        <FioriField
                            label={t('tiktokCategoryLabel')}
                            valueState={valueStateOf(errors.tiktok_category_id)}
                            message={errors.tiktok_category_id}
                        >
                            <TikTokCategoryPicker
                                value={tiktokCategory}
                                onChange={(next) => {
                                    setTiktokCategory(next);
                                    setData('tiktok_category_id', next?.id ?? null);
                                }}
                                placeholder={t('tiktokCategoryPlaceholder')}
                            />
                        </FioriField>

                        <FioriField
                            label={t('woocommerceCategoryLabel')}
                            valueState={valueStateOf(errors.woocommerce_category_id)}
                            message={errors.woocommerce_category_id}
                        >
                            <WooCommerceCategoryPicker
                                value={woocommerceCategory}
                                onChange={(next) => {
                                    setWoocommerceCategory(next);
                                    setData('woocommerce_category_id', next?.id ?? null);
                                }}
                                placeholder={t('woocommerceCategoryPlaceholder')}
                            />
                        </FioriField>
                    </FioriFormGroup>
                </MasterFormPage>
            )}
        </AppLayout>
    );
}
