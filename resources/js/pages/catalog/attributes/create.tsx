import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, FlexBox, Option, Select, Title, Link as Ui5Link } from '@ui5/webcomponents-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type SourceType = 'none' | 'master' | 'api';

const attributeTypeKeys: Record<string, string> = {
    text: 'attrTypeText',
    textarea: 'attrTypeTextarea',
    price: 'attrTypePrice',
    number: 'attrTypeNumber',
    boolean: 'attrTypeBoolean',
    select: 'attrTypeSelect',
    multiselect: 'attrTypeMultiselect',
    datetime: 'attrTypeDatetime',
    date: 'attrTypeDate',
    image: 'attrTypeImage',
    gallery: 'attrTypeGallery',
    file: 'attrTypeFile',
    checkbox: 'attrTypeCheckbox',
    video: 'attrTypeVideo',
};

const swatchTypeKeys: Record<string, string> = {
    text: 'swatchTypeText',
    color: 'swatchTypeColor',
    image: 'swatchTypeImage',
};

interface MasterSourceOption {
    value: string;
    labelKey: string;
}

interface ApiSourceOption {
    id: number;
    name: string;
}

interface Props {
    masterSources?: MasterSourceOption[];
    apiSources?: ApiSourceOption[];
}

interface AttributeForm {
    type: string;
    swatch_type: string;
    master_source: string;
    api_source_id: string;
    is_required: boolean;
    is_unique: boolean;
    is_locale_based: boolean;
    is_ai_translate: boolean;
    is_channel_based: boolean;
    is_filterable: boolean;
    translations: Record<string, string>;
    [key: string]: string | boolean | Record<string, string>;
}

export default function AttributeCreate({ masterSources = [], apiSources = [] }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributes'), href: '/catalog/attributes' },
        { title: t('addAttributeTitle'), href: '/catalog/attributes/create' },
    ];

    const attributeTypes = Object.entries(attributeTypeKeys).map(([value, key]) => ({
        value,
        label: t(key),
    }));

    const swatchTypes = Object.entries(swatchTypeKeys).map(([value, key]) => ({
        value,
        label: t(key),
    }));

    const { data, setData, post, processing, errors, isDirty } = useForm<AttributeForm>({
        type: 'text',
        swatch_type: '',
        master_source: '',
        api_source_id: '',
        is_required: false,
        is_unique: false,
        // ตั้งค่าเริ่มต้นให้ติ๊ก "ค่าต่อภาษา" ไว้ — แอตทริบิวต์ส่วนใหญ่ที่สร้างใหม่
        // ต้องการค่าแยกตามภาษาอยู่แล้ว ผู้ใช้ติ๊กออกเองได้ถ้าไม่ต้องการ
        is_locale_based: true,
        is_ai_translate: true,
        is_channel_based: false,
        is_filterable: false,
        translations: {},
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);
    // เก็บแยกจาก data.master_source/data.api_source_id เพราะ selector นี้แค่
    // ควบคุมว่าจะโชว์ dropdown ตัวไหน — ไม่ใช่ฟิลด์ที่ส่งไป backend เอง (ดู
    // AttributeController::resolveSourceBinding() ฝั่ง server ที่ตัดสินใจจาก
    // master_source/api_source_id ตรงๆ อยู่แล้ว)
    const [sourceType, setSourceType] = useState<SourceType>('none');

    const showSwatchType = data.type === 'select' || data.type === 'multiselect';

    const handleTypeChange = (value: string) => {
        setData('type', value);
        if (value !== 'select' && value !== 'multiselect') {
            setData('swatch_type', '');
            setData('master_source', '');
            setData('api_source_id', '');
            setSourceType('none');
        }
    };

    const handleSourceTypeChange = (value: SourceType) => {
        setSourceType(value);
        if (value !== 'master') {
            setData('master_source', '');
        }
        if (value !== 'api') {
            setData('api_source_id', '');
        }
    };

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/attributes', {
            onSuccess: () => router.visit('/catalog/attributes', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('addAttributeTitle')} />
            <form
                onSubmit={submit}
                style={{
                    padding: 'clamp(1rem, 3vw, 2rem)',
                    background: 'var(--sapBackgroundColor)',
                    minHeight: '100%',
                    width: '100%',
                    maxWidth: 760,
                    boxSizing: 'border-box',
                }}
            >
                <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                    <Title level="H3">{t('addAttributeTitle')}</Title>
                    <FlexBox style={{ gap: '0.5rem' }}>
                        <Button icon="nav-back" onClick={() => router.visit('/catalog/attributes')}>
                            {t('back')}
                        </Button>
                        <Button design="Emphasized" icon="save" disabled={processing} onClick={() => submit()}>
                            {processing ? t('saving') : t('saveAttribute')}
                        </Button>
                    </FlexBox>
                </FlexBox>

                <FlexBox direction="Column" style={{ gap: '1rem' }}>
                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('typeLabel')}
                            htmlFor="attribute-type"
                            required
                            valueState={valueStateOf(errors.type)}
                            message={errors.type}
                        >
                            <Select
                                id="attribute-type"
                                style={{ width: '100%' }}
                                value={data.type}
                                valueState={ui5ValueState(valueStateOf(errors.type))}
                                onChange={(event) => handleTypeChange(event.detail.selectedOption.value ?? '')}
                            >
                                {attributeTypes.map((type) => (
                                    <Option key={type.value} value={type.value}>
                                        {type.label}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>

                        {showSwatchType && (
                            <FioriField
                                label={t('swatchTypeLabel')}
                                htmlFor="attribute-swatch-type"
                                required
                                valueState={valueStateOf(errors.swatch_type)}
                                message={errors.swatch_type}
                            >
                                <Select
                                    id="attribute-swatch-type"
                                    style={{ width: '100%' }}
                                    value={data.swatch_type}
                                    valueState={ui5ValueState(valueStateOf(errors.swatch_type))}
                                    onChange={(event) => setData('swatch_type', event.detail.selectedOption.value ?? '')}
                                >
                                    {/* swatch_type เริ่มต้นเป็น '' — option ว่างนี้แทนสถานะ "ยังไม่ได้เลือก" (UI5 Select ต้องมี option ที่ตรงกับ value) */}
                                    <Option value="" />
                                    {swatchTypes.map((type) => (
                                        <Option key={type.value} value={type.value}>
                                            {type.label}
                                        </Option>
                                    ))}
                                </Select>
                            </FioriField>
                        )}

                        {showSwatchType && (
                            <FioriField label={t('sourceTypeLabel')} htmlFor="attribute-source-type">
                                <Select
                                    id="attribute-source-type"
                                    style={{ width: '100%' }}
                                    value={sourceType}
                                    onChange={(event) => handleSourceTypeChange((event.detail.selectedOption.value ?? 'none') as SourceType)}
                                >
                                    <Option value="none">{t('sourceTypeNone')}</Option>
                                    <Option value="master">{t('sourceTypeMaster')}</Option>
                                    <Option value="api">{t('sourceTypeApi')}</Option>
                                </Select>
                            </FioriField>
                        )}

                        {showSwatchType && sourceType === 'master' && (
                            <FioriField
                                label={t('masterSourceLabel')}
                                htmlFor="attribute-master-source"
                                valueState={valueStateOf(errors.master_source)}
                                message={errors.master_source}
                                hint={t('masterSourceHint')}
                            >
                                <Select
                                    id="attribute-master-source"
                                    style={{ width: '100%' }}
                                    value={data.master_source}
                                    valueState={ui5ValueState(valueStateOf(errors.master_source))}
                                    onChange={(event) => setData('master_source', event.detail.selectedOption.value ?? '')}
                                >
                                    <Option value="">{t('masterSourceNone')}</Option>
                                    {masterSources.map((source) => (
                                        <Option key={source.value} value={source.value}>
                                            {t(source.labelKey)}
                                        </Option>
                                    ))}
                                </Select>
                            </FioriField>
                        )}

                        {showSwatchType && sourceType === 'api' && (
                            <FioriField
                                label={t('apiSourceLabel')}
                                htmlFor="attribute-api-source"
                                valueState={valueStateOf(errors.api_source_id)}
                                message={errors.api_source_id}
                            >
                                <FlexBox direction="Column" style={{ gap: '0.25rem', width: '100%' }}>
                                    <Select
                                        id="attribute-api-source"
                                        style={{ width: '100%' }}
                                        value={data.api_source_id}
                                        valueState={ui5ValueState(valueStateOf(errors.api_source_id))}
                                        onChange={(event) => setData('api_source_id', event.detail.selectedOption.value ?? '')}
                                    >
                                        <Option value="">{t('apiSourceSelectPlaceholder')}</Option>
                                        {apiSources.map((source) => (
                                            <Option key={source.id} value={String(source.id)}>
                                                {source.name}
                                            </Option>
                                        ))}
                                    </Select>
                                    <Ui5Link
                                        href="/catalog/attributes/api-sources/create"
                                        onClick={(event) => {
                                            event.preventDefault();
                                            router.visit('/catalog/attributes/api-sources/create');
                                        }}
                                        style={{ fontSize: 'var(--sapFontSmallSize)' }}
                                    >
                                        {t('manageApiSources')}
                                    </Ui5Link>
                                </FlexBox>
                            </FioriField>
                        )}
                    </FioriFormGroup>

                    <FioriFormGroup title={t('validationsTitle')}>
                        <FioriField label="">
                            <CheckBox
                                text={t('isRequired')}
                                checked={data.is_required}
                                onChange={(event) => setData('is_required', event.target.checked)}
                            />
                        </FioriField>
                    </FioriFormGroup>

                    <FioriFormGroup title={t('configurationTitle')}>
                        <FioriField label="">
                            <FlexBox wrap="Wrap" style={{ columnGap: '1rem' }}>
                                <CheckBox
                                    text={t('valuePerLocale')}
                                    checked={data.is_locale_based}
                                    onChange={(event) => setData('is_locale_based', event.target.checked)}
                                />
                                <CheckBox
                                    text={t('aiTranslate')}
                                    checked={data.is_ai_translate}
                                    onChange={(event) => setData('is_ai_translate', event.target.checked)}
                                />
                                <CheckBox
                                    text={t('valuePerChannel')}
                                    checked={data.is_channel_based}
                                    onChange={(event) => setData('is_channel_based', event.target.checked)}
                                />
                                <CheckBox
                                    text={t('isFilterable')}
                                    checked={data.is_filterable}
                                    onChange={(event) => setData('is_filterable', event.target.checked)}
                                />
                            </FlexBox>
                        </FioriField>
                    </FioriFormGroup>

                    <LocaleLabelFields
                        title={t('labelTitle')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />
                </FlexBox>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} style={{ marginTop: '1rem', maxWidth: 760 }} />
            </form>
        </AppLayout>
    );
}
