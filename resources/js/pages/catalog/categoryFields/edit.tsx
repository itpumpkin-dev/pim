import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { OptionListEditor } from '@/components/catalog/option-list-editor';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type CodeEditState, codeHintKey, normalizeCodeInput } from '@/lib/code-field';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, Input, Option, Select, Tab, TabContainer, Title } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from '../categories/category-pages.module.css';

const FIELD_TYPES = ['Text', 'Textarea', 'Boolean', 'Select', 'Multiselect', 'Datetime', 'Date', 'Image', 'File', 'Checkbox'];

interface CategoryFieldItem {
    id: number;
    code: string;
    type: string;
    labels: Record<string, string>;
    options: string[] | null;
    is_required: boolean;
    is_ai_translate: boolean;
    status: boolean;
    position: number;
    display_section: string | null;
}

interface Props extends CodeEditState {
    field: CategoryFieldItem;
    canViewHistory?: boolean;
}

export default function CategoryFieldEdit({ field, canViewHistory = false, canEditCode = false, codeLocked = false }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const [tabIndex, setTabIndex] = useState(0);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categoryFields'), href: '/catalog/categoryFields' },
        { title: 'Edit Field', href: '#' },
    ];

    const { data, setData, put, processing, errors, isDirty } = useForm({
        code: field.code || '',
        type: field.type || 'Text',
        labels: field.labels || {},
        options: field.options || ([] as string[]),
        is_required: Boolean(field.is_required),
        is_ai_translate: Boolean(field.is_ai_translate),
        status: Boolean(field.status),
        position: field.position || 0,
        display_section: field.display_section || 'General',
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/catalog/categoryFields/${field.id}`, {
            onSuccess: () => router.visit('/catalog/categoryFields', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Edit Category Field: ${field.code}`} />
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

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/categoryFields/${field.id}/history`} />}

                {tabIndex === 0 && (
                    <>
                        <div className={styles.formHeader}>
                            <Title level="H3" wrappingType="Normal">
                                Edit Category Field
                            </Title>
                            <div className={styles.actions}>
                                <Button icon="nav-back" onClick={() => router.visit('/catalog/categoryFields')}>
                                    {t('back')}
                                </Button>
                                <Button design="Emphasized" icon="save" disabled={processing} loading={processing} onClick={() => submit()}>
                                    {processing ? t('saving') : t('save')}
                                </Button>
                            </div>
                        </div>

                        <div className={styles.formStack}>
                            <FioriFormGroup title="General Config">
                                <FioriField
                                    label="Code"
                                    htmlFor="field-code"
                                    hint={t(codeHintKey({ canEditCode, codeLocked }))}
                                    valueState={valueStateOf(errors.code)}
                                    message={errors.code}
                                >
                                    <Input
                                        id="field-code"
                                        className={styles.fullWidth}
                                        value={data.code}
                                        disabled={!canEditCode}
                                        maxlength={100}
                                        valueState={ui5ValueState(valueStateOf(errors.code))}
                                        onInput={(e) => setData('code', normalizeCodeInput(e.target.value))}
                                    />
                                </FioriField>

                                <FioriField label="Field Type" htmlFor="field-type" required>
                                    <Select
                                        id="field-type"
                                        className={styles.fullWidth}
                                        value={data.type}
                                        onChange={(e) => setData('type', e.detail.selectedOption.value ?? 'Text')}
                                    >
                                        {FIELD_TYPES.map((type) => (
                                            <Option key={type} value={type}>
                                                {type}
                                            </Option>
                                        ))}
                                    </Select>
                                </FioriField>

                                {(data.type === 'Select' || data.type === 'Multiselect') && (
                                    <FioriField label="Options" fullWidth>
                                        <OptionListEditor value={data.options} onChange={(options) => setData('options', options)} />
                                    </FioriField>
                                )}

                                <FioriField
                                    label="Position"
                                    htmlFor="field-position"
                                    valueState={valueStateOf(errors.position)}
                                    message={errors.position}
                                >
                                    <Input
                                        id="field-position"
                                        type="Number"
                                        className={styles.fullWidth}
                                        value={String(data.position)}
                                        valueState={ui5ValueState(valueStateOf(errors.position))}
                                        onInput={(e) => setData('position', Number(e.target.value))}
                                    />
                                </FioriField>

                                <FioriField
                                    label="Display Section"
                                    htmlFor="field-display-section"
                                    valueState={valueStateOf(errors.display_section)}
                                    message={errors.display_section}
                                    hint="Optional UI grouping name"
                                >
                                    <Input
                                        id="field-display-section"
                                        className={styles.fullWidth}
                                        value={data.display_section}
                                        valueState={ui5ValueState(valueStateOf(errors.display_section))}
                                        onInput={(e) => setData('display_section', e.target.value)}
                                    />
                                </FioriField>

                                <FioriField label="">
                                    <div className={styles.checkRow}>
                                        <CheckBox
                                            text="Required field"
                                            checked={data.is_required}
                                            onChange={(e) => setData('is_required', e.target.checked)}
                                        />
                                        <CheckBox
                                            text={t('aiTranslate')}
                                            checked={data.is_ai_translate}
                                            onChange={(e) => setData('is_ai_translate', e.target.checked)}
                                        />
                                        <CheckBox text="Status Active" checked={data.status} onChange={(e) => setData('status', e.target.checked)} />
                                    </div>
                                </FioriField>
                            </FioriFormGroup>

                            <LocaleLabelFields
                                title="Field Labels"
                                values={data.labels}
                                onChange={(localeId, value) => setData('labels', { ...data.labels, [localeId]: value })}
                            />
                        </div>

                        <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} className={styles.errorSummary} />
                    </>
                )}
            </form>
        </AppLayout>
    );
}
