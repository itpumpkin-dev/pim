import { AttributeOptionsPanel, type AttributeOptionItem } from '@/components/catalog/attribute-options-panel';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, FioriMessageStrip, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { codeHintKey, normalizeCodeInput, type CodeEditState } from '@/lib/code-field';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, FlexBox, Input, Option, Select, Tab, TabContainer, Title, Link as Ui5Link } from '@ui5/webcomponents-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const swatchTypeKeys: Record<string, string> = {
    text: 'swatchTypeText',
    color: 'swatchTypeColor',
    image: 'swatchTypeImage',
};

type SourceType = 'none' | 'master' | 'api';

interface Attribute {
    id: number;
    code: string;
    name: string;
    type: string;
    swatch_type: string | null;
    master_source: string | null;
    api_source_id: number | null;
    is_required: boolean;
    is_unique: boolean;
    is_locale_based: boolean;
    is_ai_translate: boolean;
    is_channel_based: boolean;
    is_filterable: boolean;
}

interface MasterSourceOption {
    value: string;
    labelKey: string;
}

interface ApiSourceOption {
    id: number;
    name: string;
}

interface AttributeForm {
    code: string;
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

interface Props extends CodeEditState {
    attribute: Attribute;
    translations: Record<string, string>;
    options?: AttributeOptionItem[];
    masterSources?: MasterSourceOption[];
    apiSources?: ApiSourceOption[];
    canViewHistory?: boolean;
}

export default function AttributeEdit({
    attribute,
    translations,
    options = [],
    masterSources = [],
    apiSources = [],
    canViewHistory = false,
    canEditCode = false,
    codeLocked = false,
}: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributes'), href: '/catalog/attributes' },
        { title: t('editAttributeTitle'), href: '#' },
    ];

    const attributeTypes = [
        { value: 'text', label: t('attrTypeText') },
        { value: 'textarea', label: t('attrTypeTextarea') },
        { value: 'price', label: t('attrTypePrice') },
        { value: 'number', label: t('attrTypeNumber') },
        { value: 'boolean', label: t('attrTypeBoolean') },
        { value: 'select', label: t('attrTypeSelect') },
        { value: 'multiselect', label: t('attrTypeMultiselect') },
        { value: 'datetime', label: t('attrTypeDatetime') },
        { value: 'date', label: t('attrTypeDate') },
        { value: 'image', label: t('attrTypeImage') },
        { value: 'gallery', label: t('attrTypeGallery') },
        { value: 'file', label: t('attrTypeFile') },
        { value: 'checkbox', label: t('attrTypeCheckbox') },
        { value: 'video', label: t('attrTypeVideo') },
    ];

    const swatchTypes = Object.entries(swatchTypeKeys).map(([value, key]) => ({
        value,
        label: t(key),
    }));

    const { data, setData, put, processing, errors, isDirty } = useForm<AttributeForm>({
        code: attribute.code || '',
        type: attribute.type || 'text',
        swatch_type: attribute.swatch_type || '',
        master_source: attribute.master_source || '',
        api_source_id: attribute.api_source_id ? String(attribute.api_source_id) : '',
        is_required: Boolean(attribute.is_required),
        is_unique: Boolean(attribute.is_unique),
        is_locale_based: Boolean(attribute.is_locale_based),
        is_ai_translate: Boolean(attribute.is_ai_translate),
        is_channel_based: Boolean(attribute.is_channel_based),
        is_filterable: Boolean(attribute.is_filterable),
        translations: translations || {},
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);
    const [sourceType, setSourceType] = useState<SourceType>(attribute.master_source ? 'master' : attribute.api_source_id ? 'api' : 'none');

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

    const masterBound = data.master_source !== '';
    const apiBound = data.api_source_id !== '';

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/attributes/${attribute.id}`, {
            onSuccess: () => router.visit('/catalog/attributes', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('editAttributeTitle')}: ${attribute.code}`} />
            <form
                onSubmit={submit}
                style={{
                    padding: 'clamp(1rem, 3vw, 2rem)',
                    background: 'var(--sapBackgroundColor)',
                    minHeight: '100%',
                    width: '100%',
                    boxSizing: 'border-box',
                }}
            >
                {canViewHistory && (
                    <TabContainer collapsed onTabSelect={(event) => setTabIndex(event.detail.tabIndex)} style={{ marginBottom: '1.5rem' }}>
                        <Tab text="General" selected={tabIndex === 0} />
                        <Tab text="History" selected={tabIndex === 1} />
                    </TabContainer>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/attributes/${attribute.id}/history`} />}

                {tabIndex === 0 && (
                    <>
                        <FlexBox justifyContent="SpaceBetween" alignItems="Center" wrap="Wrap" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                            <Title level="H3">{t('editAttributeTitle')}</Title>
                            <FlexBox style={{ gap: '0.5rem' }}>
                                <Button icon="nav-back" onClick={() => router.visit('/catalog/attributes')}>
                                    {t('back')}
                                </Button>
                                <Button design="Emphasized" icon="save" disabled={processing} onClick={() => submit()}>
                                    {processing ? t('saving') : t('saveAttribute')}
                                </Button>
                            </FlexBox>
                        </FlexBox>

                        <FlexBox direction="Column" style={{ gap: '1rem', maxWidth: 760 }}>
                            <FioriFormGroup title={t('generalTitle')}>
                                <FioriField
                                    label={t('code')}
                                    htmlFor="attribute-code"
                                    hint={t(codeHintKey({ canEditCode, codeLocked }))}
                                    valueState={valueStateOf(errors.code)}
                                    message={errors.code}
                                >
                                    <Input
                                        id="attribute-code"
                                        style={{ width: '100%' }}
                                        value={data.code}
                                        disabled={!canEditCode}
                                        maxlength={45}
                                        valueState={ui5ValueState(valueStateOf(errors.code))}
                                        onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                                    />
                                </FioriField>

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

                            {showSwatchType && (
                                <FioriFormGroup title={t('optionsTitle')}>
                                    {masterBound && (
                                        <FioriMessageStrip severity="information" style={{ marginBottom: '1rem' }}>
                                            {t('masterSourceOptionsCustomizable', {
                                                source: t(masterSources.find((s) => s.value === data.master_source)?.labelKey ?? data.master_source),
                                            })}
                                        </FioriMessageStrip>
                                    )}
                                    {apiBound && (
                                        <FioriMessageStrip severity="information" style={{ marginBottom: '1rem' }}>
                                            {t('apiSourceOptionsCustomizable', {
                                                source: apiSources.find((s) => String(s.id) === data.api_source_id)?.name ?? t('apiSourceLabel'),
                                            })}
                                        </FioriMessageStrip>
                                    )}
                                    <AttributeOptionsPanel
                                        attributeId={attribute.id}
                                        swatchType={data.swatch_type}
                                        options={options}
                                        isMasterBound={masterBound}
                                        isApiBound={apiBound}
                                    />
                                </FioriFormGroup>
                            )}
                        </FlexBox>

                        <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} style={{ marginTop: '1rem', maxWidth: 760 }} />
                    </>
                )}
            </form>
        </AppLayout>
    );
}
