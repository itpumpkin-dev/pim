import { FioriField, FioriFormErrorSummary, FioriFormGroup, FioriMessageStrip, ui5ValueState, valueStateOf } from '@/components/fiori-form';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/save.js';
import { Button, CheckBox, FlexBox, Input, Option, Select, Title } from '@ui5/webcomponents-react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

type AuthType = 'none' | 'api_key_header' | 'bearer' | 'basic';

interface ApiSourceForm {
    name: string;
    endpoint: string;
    method: string;
    auth_type: AuthType;
    credentials: Record<string, string>;
    rows_path: string;
    code_path: string;
    label_path: string;
    is_active_path: string;
    is_active: boolean;
    [key: string]: string | boolean | Record<string, string>;
}

export default function AttributeApiSourceCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributeApiSources'), href: '/catalog/attributes/api-sources' },
        { title: t('addAttributeApiSourceTitle'), href: '/catalog/attributes/api-sources/create' },
    ];

    const { data, setData, post, processing, errors, isDirty } = useForm<ApiSourceForm>({
        name: '',
        endpoint: '',
        method: 'GET',
        auth_type: 'none',
        credentials: {},
        rows_path: '',
        code_path: '',
        label_path: '',
        is_active_path: '',
        is_active: true,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const setCredential = (key: string, value: string) => setData('credentials', { ...data.credentials, [key]: value });

    const handleAuthTypeChange = (value: AuthType) => {
        setData('auth_type', value);
        setData('credentials', {});
    };

    const submit = (event?: FormEvent) => {
        event?.preventDefault();
        skipNavigationGuardRef.current = true;
        post('/catalog/attributes/api-sources', {
            onSuccess: () => router.visit('/catalog/attributes/api-sources', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('addAttributeApiSourceTitle')} />
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
                    <Title level="H3">{t('addAttributeApiSourceTitle')}</Title>
                    <FlexBox style={{ gap: '0.5rem' }}>
                        <Button icon="nav-back" onClick={() => router.visit('/catalog/attributes/api-sources')}>
                            {t('back')}
                        </Button>
                        <Button design="Emphasized" icon="save" disabled={processing} onClick={() => submit()}>
                            {processing ? t('saving') : t('saveApiSource')}
                        </Button>
                    </FlexBox>
                </FlexBox>

                <FlexBox direction="Column" style={{ gap: '1rem' }}>
                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('apiSourceNameLabel')}
                            htmlFor="api-source-name"
                            required
                            valueState={valueStateOf(errors.name)}
                            message={errors.name}
                        >
                            <Input
                                id="api-source-name"
                                style={{ width: '100%' }}
                                value={data.name}
                                onInput={(e) => setData('name', e.target.value)}
                                valueState={ui5ValueState(valueStateOf(errors.name))}
                            />
                        </FioriField>

                        <FioriField
                            label={t('apiSourceEndpointLabel')}
                            htmlFor="api-source-endpoint"
                            required
                            valueState={valueStateOf(errors.endpoint)}
                            message={errors.endpoint}
                            hint={t('apiSourceEndpointHint')}
                        >
                            <Input
                                id="api-source-endpoint"
                                style={{ width: '100%' }}
                                value={data.endpoint}
                                onInput={(e) => setData('endpoint', e.target.value)}
                                valueState={ui5ValueState(valueStateOf(errors.endpoint))}
                            />
                        </FioriField>

                        <FioriField
                            label={t('apiSourceMethodLabel')}
                            htmlFor="api-source-method"
                            required
                            valueState={valueStateOf(errors.method)}
                            message={errors.method}
                        >
                            <Select
                                id="api-source-method"
                                style={{ width: '100%' }}
                                value={data.method}
                                valueState={ui5ValueState(valueStateOf(errors.method))}
                                onChange={(e) => setData('method', e.detail.selectedOption.value ?? 'GET')}
                            >
                                <Option value="GET">GET</Option>
                                <Option value="POST">POST</Option>
                            </Select>
                        </FioriField>

                        <FioriField
                            label={t('apiSourceAuthTypeLabel')}
                            htmlFor="api-source-auth-type"
                            required
                            valueState={valueStateOf(errors.auth_type)}
                            message={errors.auth_type}
                        >
                            <Select
                                id="api-source-auth-type"
                                style={{ width: '100%' }}
                                value={data.auth_type}
                                valueState={ui5ValueState(valueStateOf(errors.auth_type))}
                                onChange={(e) => handleAuthTypeChange((e.detail.selectedOption.value ?? 'none') as AuthType)}
                            >
                                <Option value="none">{t('apiSourceAuthNone')}</Option>
                                <Option value="api_key_header">{t('apiSourceAuthApiKeyHeader')}</Option>
                                <Option value="bearer">{t('apiSourceAuthBearer')}</Option>
                                <Option value="basic">{t('apiSourceAuthBasic')}</Option>
                            </Select>
                        </FioriField>

                        {data.auth_type === 'api_key_header' && (
                            <>
                                <FioriField
                                    label={t('apiSourceHeaderNameLabel')}
                                    htmlFor="api-source-header-name"
                                    valueState={valueStateOf(errors['credentials.header_name'])}
                                    message={errors['credentials.header_name']}
                                >
                                    <Input
                                        id="api-source-header-name"
                                        style={{ width: '100%' }}
                                        placeholder="X-Api-Key"
                                        value={data.credentials.header_name ?? ''}
                                        onInput={(e) => setCredential('header_name', e.target.value)}
                                    />
                                </FioriField>
                                <FioriField
                                    label={t('apiSourceApiKeyLabel')}
                                    htmlFor="api-source-api-key"
                                    valueState={valueStateOf(errors['credentials.api_key'])}
                                    message={errors['credentials.api_key']}
                                >
                                    <Input
                                        id="api-source-api-key"
                                        type="Password"
                                        style={{ width: '100%' }}
                                        value={data.credentials.api_key ?? ''}
                                        onInput={(e) => setCredential('api_key', e.target.value)}
                                    />
                                </FioriField>
                            </>
                        )}

                        {data.auth_type === 'bearer' && (
                            <FioriField
                                label={t('apiSourceTokenLabel')}
                                htmlFor="api-source-token"
                                valueState={valueStateOf(errors['credentials.token'])}
                                message={errors['credentials.token']}
                            >
                                <Input
                                    id="api-source-token"
                                    type="Password"
                                    style={{ width: '100%' }}
                                    value={data.credentials.token ?? ''}
                                    onInput={(e) => setCredential('token', e.target.value)}
                                />
                            </FioriField>
                        )}

                        {data.auth_type === 'basic' && (
                            <>
                                <FioriField
                                    label={t('apiSourceUsernameLabel')}
                                    htmlFor="api-source-username"
                                    valueState={valueStateOf(errors['credentials.username'])}
                                    message={errors['credentials.username']}
                                >
                                    <Input
                                        id="api-source-username"
                                        style={{ width: '100%' }}
                                        value={data.credentials.username ?? ''}
                                        onInput={(e) => setCredential('username', e.target.value)}
                                    />
                                </FioriField>
                                <FioriField
                                    label={t('apiSourcePasswordLabel')}
                                    htmlFor="api-source-password"
                                    valueState={valueStateOf(errors['credentials.password'])}
                                    message={errors['credentials.password']}
                                >
                                    <Input
                                        id="api-source-password"
                                        type="Password"
                                        style={{ width: '100%' }}
                                        value={data.credentials.password ?? ''}
                                        onInput={(e) => setCredential('password', e.target.value)}
                                    />
                                </FioriField>
                            </>
                        )}
                    </FioriFormGroup>

                    <FioriFormGroup title={t('apiSourceMappingTitle')}>
                        <FioriField
                            label={t('apiSourceRowsPathLabel')}
                            htmlFor="api-source-rows-path"
                            hint={t('apiSourceRowsPathHint')}
                            valueState={valueStateOf(errors.rows_path)}
                            message={errors.rows_path}
                        >
                            <Input
                                id="api-source-rows-path"
                                style={{ width: '100%' }}
                                value={data.rows_path}
                                onInput={(e) => setData('rows_path', e.target.value)}
                            />
                        </FioriField>
                        <FioriField
                            label={t('apiSourceCodePathLabel')}
                            htmlFor="api-source-code-path"
                            required
                            hint={t('apiSourceCodePathHint')}
                            valueState={valueStateOf(errors.code_path)}
                            message={errors.code_path}
                        >
                            <Input
                                id="api-source-code-path"
                                style={{ width: '100%' }}
                                value={data.code_path}
                                onInput={(e) => setData('code_path', e.target.value)}
                            />
                        </FioriField>
                        <FioriField
                            label={t('apiSourceLabelPathLabel')}
                            htmlFor="api-source-label-path"
                            required
                            hint={t('apiSourceLabelPathHint')}
                            valueState={valueStateOf(errors.label_path)}
                            message={errors.label_path}
                        >
                            <Input
                                id="api-source-label-path"
                                style={{ width: '100%' }}
                                value={data.label_path}
                                onInput={(e) => setData('label_path', e.target.value)}
                            />
                        </FioriField>
                        <FioriField
                            label={t('apiSourceIsActivePathLabel')}
                            htmlFor="api-source-is-active-path"
                            hint={t('apiSourceIsActivePathHint')}
                            valueState={valueStateOf(errors.is_active_path)}
                            message={errors.is_active_path}
                        >
                            <Input
                                id="api-source-is-active-path"
                                style={{ width: '100%' }}
                                value={data.is_active_path}
                                onInput={(e) => setData('is_active_path', e.target.value)}
                            />
                        </FioriField>
                    </FioriFormGroup>

                    <FioriFormGroup title={t('validationsTitle')}>
                        <FioriField label="">
                            <CheckBox
                                text={t('apiSourceStatusLabel')}
                                checked={data.is_active}
                                onChange={(e) => setData('is_active', e.target.checked)}
                            />
                        </FioriField>
                    </FioriFormGroup>

                    <FioriMessageStrip severity="information">{t('testConnectionSaveFirstHint')}</FioriMessageStrip>
                </FlexBox>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} style={{ marginTop: '1rem', maxWidth: 760 }} />
            </form>
        </AppLayout>
    );
}
