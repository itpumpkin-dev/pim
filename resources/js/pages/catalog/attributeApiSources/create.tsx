import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, FioriMessageStrip, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

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

    const submit = (event: FormEvent) => {
        event.preventDefault();
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
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%', width: '100%', maxWidth: 760 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('addAttributeApiSourceTitle')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/attributes/api-sources" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>{t('back')}</Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                            sx={{ ...fioriEmphasizedSx, px: 2.5 }}
                        >
                            {processing ? t('saving') : t('saveApiSource')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField label={t('apiSourceNameLabel')} htmlFor="api-source-name" required valueState={valueStateOf(errors.name)} message={errors.name}>
                            <TextField id="api-source-name" fullWidth size="small" value={data.name} onChange={(e) => setData('name', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.name))} />
                        </FioriField>

                        <FioriField
                            label={t('apiSourceEndpointLabel')}
                            htmlFor="api-source-endpoint"
                            required
                            valueState={valueStateOf(errors.endpoint)}
                            message={errors.endpoint}
                            hint={t('apiSourceEndpointHint')}
                        >
                            <TextField id="api-source-endpoint" fullWidth size="small" value={data.endpoint} onChange={(e) => setData('endpoint', e.target.value)} sx={fioriFieldStateSx(valueStateOf(errors.endpoint))} />
                        </FioriField>

                        <FioriField label={t('apiSourceMethodLabel')} htmlFor="api-source-method" required valueState={valueStateOf(errors.method)} message={errors.method}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.method))}>
                                <Select id="api-source-method" value={data.method} onChange={(e) => setData('method', e.target.value)}>
                                    <MenuItem value="GET">GET</MenuItem>
                                    <MenuItem value="POST">POST</MenuItem>
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField label={t('apiSourceAuthTypeLabel')} htmlFor="api-source-auth-type" required valueState={valueStateOf(errors.auth_type)} message={errors.auth_type}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.auth_type))}>
                                <Select id="api-source-auth-type" value={data.auth_type} onChange={(e) => handleAuthTypeChange(e.target.value as AuthType)}>
                                    <MenuItem value="none">{t('apiSourceAuthNone')}</MenuItem>
                                    <MenuItem value="api_key_header">{t('apiSourceAuthApiKeyHeader')}</MenuItem>
                                    <MenuItem value="bearer">{t('apiSourceAuthBearer')}</MenuItem>
                                    <MenuItem value="basic">{t('apiSourceAuthBasic')}</MenuItem>
                                </Select>
                            </FormControl>
                        </FioriField>

                        {data.auth_type === 'api_key_header' && (
                            <>
                                <FioriField label={t('apiSourceHeaderNameLabel')} htmlFor="api-source-header-name" valueState={valueStateOf(errors['credentials.header_name'])} message={errors['credentials.header_name']}>
                                    <TextField id="api-source-header-name" fullWidth size="small" placeholder="X-Api-Key" value={data.credentials.header_name ?? ''} onChange={(e) => setCredential('header_name', e.target.value)} />
                                </FioriField>
                                <FioriField label={t('apiSourceApiKeyLabel')} htmlFor="api-source-api-key" valueState={valueStateOf(errors['credentials.api_key'])} message={errors['credentials.api_key']}>
                                    <TextField id="api-source-api-key" type="password" fullWidth size="small" value={data.credentials.api_key ?? ''} onChange={(e) => setCredential('api_key', e.target.value)} />
                                </FioriField>
                            </>
                        )}

                        {data.auth_type === 'bearer' && (
                            <FioriField label={t('apiSourceTokenLabel')} htmlFor="api-source-token" valueState={valueStateOf(errors['credentials.token'])} message={errors['credentials.token']}>
                                <TextField id="api-source-token" type="password" fullWidth size="small" value={data.credentials.token ?? ''} onChange={(e) => setCredential('token', e.target.value)} />
                            </FioriField>
                        )}

                        {data.auth_type === 'basic' && (
                            <>
                                <FioriField label={t('apiSourceUsernameLabel')} htmlFor="api-source-username" valueState={valueStateOf(errors['credentials.username'])} message={errors['credentials.username']}>
                                    <TextField id="api-source-username" fullWidth size="small" value={data.credentials.username ?? ''} onChange={(e) => setCredential('username', e.target.value)} />
                                </FioriField>
                                <FioriField label={t('apiSourcePasswordLabel')} htmlFor="api-source-password" valueState={valueStateOf(errors['credentials.password'])} message={errors['credentials.password']}>
                                    <TextField id="api-source-password" type="password" fullWidth size="small" value={data.credentials.password ?? ''} onChange={(e) => setCredential('password', e.target.value)} />
                                </FioriField>
                            </>
                        )}
                    </FioriFormGroup>

                    <FioriFormGroup title={t('apiSourceMappingTitle')}>
                        <FioriField label={t('apiSourceRowsPathLabel')} htmlFor="api-source-rows-path" hint={t('apiSourceRowsPathHint')} valueState={valueStateOf(errors.rows_path)} message={errors.rows_path}>
                            <TextField id="api-source-rows-path" fullWidth size="small" value={data.rows_path} onChange={(e) => setData('rows_path', e.target.value)} />
                        </FioriField>
                        <FioriField label={t('apiSourceCodePathLabel')} htmlFor="api-source-code-path" required hint={t('apiSourceCodePathHint')} valueState={valueStateOf(errors.code_path)} message={errors.code_path}>
                            <TextField id="api-source-code-path" fullWidth size="small" value={data.code_path} onChange={(e) => setData('code_path', e.target.value)} />
                        </FioriField>
                        <FioriField label={t('apiSourceLabelPathLabel')} htmlFor="api-source-label-path" required hint={t('apiSourceLabelPathHint')} valueState={valueStateOf(errors.label_path)} message={errors.label_path}>
                            <TextField id="api-source-label-path" fullWidth size="small" value={data.label_path} onChange={(e) => setData('label_path', e.target.value)} />
                        </FioriField>
                        <FioriField label={t('apiSourceIsActivePathLabel')} htmlFor="api-source-is-active-path" hint={t('apiSourceIsActivePathHint')} valueState={valueStateOf(errors.is_active_path)} message={errors.is_active_path}>
                            <TextField id="api-source-is-active-path" fullWidth size="small" value={data.is_active_path} onChange={(e) => setData('is_active_path', e.target.value)} />
                        </FioriField>
                    </FioriFormGroup>

                    <FioriFormGroup title={t('validationsTitle')}>
                        <FioriField label="">
                            <FormControlLabel
                                control={<Checkbox checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                                label={t('apiSourceStatusLabel')}
                            />
                        </FioriField>
                    </FioriFormGroup>

                    <FioriMessageStrip severity="information">{t('testConnectionSaveFirstHint')}</FioriMessageStrip>
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
            </Box>
        </AppLayout>
    );
}
