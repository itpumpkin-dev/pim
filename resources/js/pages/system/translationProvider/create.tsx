import { FioriField, FioriFormErrorSummary, FioriFormGroup, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/refresh.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, ComboBox, ComboBoxItem, Input, Option, Select, Title } from '@ui5/webcomponents-react';
import { FormEvent, useState } from 'react';

import styles from './provider-pages.module.css';

interface ProviderField {
    key: string;
    label: string;
    type: string;
    required: boolean;
    dynamic?: boolean;
}

interface ProviderTypeSchema {
    label: string;
    fields: ProviderField[];
}

type ProviderTypes = Record<string, ProviderTypeSchema>;

interface DynamicOption {
    value: string;
    label: string;
}

interface Props {
    providerTypes: ProviderTypes;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'SYSTEM', href: '#' },
    { title: 'TRANSLATION PROVIDERS', href: '/system/translationProviders' },
    { title: 'ADD PROVIDER', href: '/system/translationProviders/create' },
];

export default function TranslationProviderCreate({ providerTypes }: Props) {
    const { data, setData, post, processing, errors, isDirty } = useForm({
        type: '',
        name: '',
        enabled: true as boolean,
        is_default: false as boolean,
        credentials: {} as Record<string, string>,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/system/translationProviders', {
            replace: true,
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const fields = data.type ? (providerTypes[data.type]?.fields ?? []) : [];

    const [dynamicOptions, setDynamicOptions] = useState<Record<string, DynamicOption[]>>({});
    const [loadingField, setLoadingField] = useState<string | null>(null);

    const setCredential = (key: string, value: string) => {
        setData('credentials', { ...data.credentials, [key]: value });
    };

    const loadOptions = (field: ProviderField) => {
        setLoadingField(field.key);
        const params = new URLSearchParams({ type: data.type, field: field.key, ...data.credentials });

        fetch(`/system/translationProviders/field-options?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { options: [] }))
            .then((json) => setDynamicOptions((prev) => ({ ...prev, [field.key]: json.options ?? [] })))
            .finally(() => setLoadingField(null));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Add Translation Provider" />
            <form onSubmit={submit} className={styles.page}>
                <div className={styles.header}>
                    <Title level="H2" size="H4">
                        Add Translation Provider
                    </Title>
                    <div className={styles.headerActions}>
                        <Button icon="nav-back" onClick={() => router.visit('/system/translationProviders')}>
                            Back
                        </Button>
                        <Button type="Submit" design="Emphasized" icon="save" disabled={processing} loading={processing} loadingDelay={0}>
                            {processing ? 'Saving…' : 'Save Provider'}
                        </Button>
                    </div>
                </div>

                <div className={styles.formBody}>
                    {/* General Panel */}
                    <FioriFormGroup title="General">
                        <FioriField
                            label="Provider Type"
                            htmlFor="provider-type"
                            required
                            fullWidth
                            valueState={valueStateOf(errors.type)}
                            message={errors.type}
                        >
                            <Select
                                id="provider-type"
                                style={{ width: '100%' }}
                                required
                                value={data.type}
                                valueState={ui5ValueState(valueStateOf(errors.type))}
                                onChange={(e) => {
                                    setData('type', e.detail.selectedOption.value ?? '');
                                    setData('credentials', {});
                                }}
                            >
                                <Option value="">&nbsp;</Option>
                                {Object.entries(providerTypes).map(([value, schema]) => (
                                    <Option key={value} value={value}>
                                        {schema.label}
                                    </Option>
                                ))}
                            </Select>
                        </FioriField>
                        <FioriField
                            label="Name"
                            htmlFor="provider-name"
                            required
                            fullWidth
                            valueState={valueStateOf(errors.name)}
                            message={errors.name}
                        >
                            <Input
                                id="provider-name"
                                style={{ width: '100%' }}
                                required
                                placeholder="e.g. Google Cloud Translate (production)"
                                value={data.name}
                                valueState={ui5ValueState(valueStateOf(errors.name))}
                                onInput={(e) => setData('name', e.target.value)}
                            />
                        </FioriField>
                    </FioriFormGroup>

                    {/* Credentials Panel — fields are entirely driven by the selected provider type's schema */}
                    {fields.length > 0 && (
                        <FioriFormGroup title="Credentials">
                            {fields.map((field) => {
                                const error = (errors as Record<string, string | undefined>)[`credentials.${field.key}`];
                                const inputId = `provider-credential-${field.key}`;

                                return (
                                    <FioriField
                                        key={field.key}
                                        label={field.label}
                                        htmlFor={inputId}
                                        required={field.required}
                                        fullWidth
                                        valueState={valueStateOf(error)}
                                        message={error}
                                    >
                                        {field.dynamic ? (
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', width: '100%' }}>
                                                {/* free text หรือเลือกจากรายการที่โหลดจาก server — เก็บ option.value */}
                                                <ComboBox
                                                    id={inputId}
                                                    style={{ flex: 1, minWidth: 0 }}
                                                    required={field.required}
                                                    noTypeahead
                                                    filter="Contains"
                                                    value={data.credentials[field.key] ?? ''}
                                                    valueState={ui5ValueState(valueStateOf(error))}
                                                    onInput={(e) => setCredential(field.key, e.target.value)}
                                                    onSelectionChange={(e) => {
                                                        const value = e.detail.item?.value;
                                                        if (value) {
                                                            setCredential(field.key, value);
                                                        }
                                                    }}
                                                >
                                                    {(dynamicOptions[field.key] ?? []).map((option) => (
                                                        <ComboBoxItem key={option.value} text={option.label} value={option.value} />
                                                    ))}
                                                </ComboBox>
                                                <Button
                                                    design="Transparent"
                                                    icon="refresh"
                                                    tooltip="Load options from server"
                                                    accessibleName="Load options from server"
                                                    disabled={loadingField === field.key}
                                                    loading={loadingField === field.key}
                                                    loadingDelay={0}
                                                    onClick={() => loadOptions(field)}
                                                />
                                            </div>
                                        ) : (
                                            <Input
                                                id={inputId}
                                                style={{ width: '100%' }}
                                                required={field.required}
                                                type={field.type === 'password' ? 'Password' : 'Text'}
                                                value={data.credentials[field.key] ?? ''}
                                                valueState={ui5ValueState(valueStateOf(error))}
                                                onInput={(e) => setCredential(field.key, e.target.value)}
                                            />
                                        )}
                                    </FioriField>
                                );
                            })}
                        </FioriFormGroup>
                    )}

                    {/* Status Panel */}
                    <FioriFormGroup title="Status">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                            <CheckBox text="Enabled" checked={data.enabled} onChange={(e) => setData('enabled', e.target.checked)} />
                            <CheckBox
                                text="Set as default (used for all translation jobs)"
                                checked={data.is_default}
                                onChange={(e) => setData('is_default', e.target.checked)}
                            />
                        </div>
                    </FioriFormGroup>
                </div>

                <FioriFormErrorSummary
                    errors={errors}
                    message="Please correct the highlighted fields before saving."
                    style={{ marginTop: '1.5rem', maxWidth: 800 }}
                />
            </form>
        </AppLayout>
    );
}
