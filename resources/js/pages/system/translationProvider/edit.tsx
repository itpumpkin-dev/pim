import AppLayout from '@/layouts/app-layout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControlLabel,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';

interface ProviderField {
    key: string;
    label: string;
    type: string;
    required: boolean;
    dynamic?: boolean;
}

interface DynamicOption {
    value: string;
    label: string;
}

interface ProviderTypeSchema {
    label: string;
    fields: ProviderField[];
}

type ProviderTypes = Record<string, ProviderTypeSchema>;

interface TranslationProviderModel {
    id: number;
    type: string;
    name: string;
    enabled: boolean;
    is_default: boolean;
    credentials_set: Record<string, boolean>;
}

interface Props {
    providerTypes: ProviderTypes;
    translationProvider: TranslationProviderModel;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'SYSTEM', href: '#' },
    { title: 'TRANSLATION PROVIDERS', href: '/system/translationProviders' },
    { title: 'EDIT PROVIDER', href: '#' },
];

export default function TranslationProviderEdit({ providerTypes, translationProvider }: Props) {
    const { data, setData, put, processing, errors, isDirty } = useForm({
        type: translationProvider.type,
        name: translationProvider.name,
        enabled: translationProvider.enabled,
        is_default: translationProvider.is_default,
        credentials: {} as Record<string, string>,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        skipNavigationGuardRef.current = true;
        put(`/system/translationProviders/${translationProvider.id}`, {
            replace: true,
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    const fields = data.type ? (providerTypes[data.type]?.fields ?? []) : [];
    const credentialsSet = data.type === translationProvider.type ? translationProvider.credentials_set : {};

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
            <Head title={`Edit Translation Provider: ${translationProvider.name}`} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: 'background.default', minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        Edit Translation Provider
                    </Typography>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            component={Link}
                            href="/system/translationProviders"
                            variant="outlined"
                            sx={{
                                borderColor: 'primary.main',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                '&:hover': { borderColor: 'primary.main' },
                            }}
                        >
                            Back
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={{
                                bgcolor: 'primary.main',
                                color: '#fff',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                '&:hover': { bgcolor: 'primary.dark' },
                            }}
                        >
                            {processing ? 'Saving…' : 'Save Provider'}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={3} sx={{ maxWidth: 800 }}>
                    {/* General Panel */}
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                        <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                            General
                        </Typography>
                        <Stack spacing={2}>
                            <TextField
                                select
                                label="Provider Type *"
                                required
                                fullWidth
                                size="small"
                                value={data.type}
                                onChange={(e) => {
                                    setData('type', e.target.value);
                                    setData('credentials', {});
                                }}
                                error={Boolean(errors.type)}
                                helperText={errors.type}
                            >
                                {Object.entries(providerTypes).map(([value, schema]) => (
                                    <MenuItem key={value} value={value}>
                                        {schema.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                label="Name *"
                                required
                                fullWidth
                                size="small"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                error={Boolean(errors.name)}
                                helperText={errors.name}
                            />
                        </Stack>
                    </Paper>

                    {/* Credentials Panel */}
                    {fields.length > 0 && (
                        <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                            <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ mb: 2 }}>
                                Credentials
                            </Typography>
                            <Stack spacing={2}>
                                {fields.map((field) => {
                                    const alreadySet = credentialsSet[field.key];
                                    const placeholder = alreadySet ? '•••••••• (leave blank to keep current value)' : undefined;

                                    if (field.dynamic) {
                                        return (
                                            <Stack key={field.key} direction="row" spacing={1} alignItems="flex-start">
                                                <Autocomplete
                                                    freeSolo
                                                    fullWidth
                                                    size="small"
                                                    options={dynamicOptions[field.key] ?? []}
                                                    getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
                                                    isOptionEqualToValue={(option, value) =>
                                                        typeof value === 'string' ? option.value === value : option.value === value.value
                                                    }
                                                    inputValue={data.credentials[field.key] ?? ''}
                                                    onInputChange={(_, newInputValue, reason) => {
                                                        if (reason === 'input') {
                                                            setCredential(field.key, newInputValue);
                                                        }
                                                    }}
                                                    onChange={(_, newValue) => {
                                                        if (newValue && typeof newValue !== 'string') {
                                                            setCredential(field.key, newValue.value);
                                                        }
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            label={field.required && !alreadySet ? `${field.label} *` : field.label}
                                                            required={field.required && !alreadySet}
                                                            placeholder={placeholder}
                                                            error={Boolean(errors[`credentials.${field.key}`])}
                                                            helperText={errors[`credentials.${field.key}`]}
                                                        />
                                                    )}
                                                />
                                                <Tooltip title="Load options from server">
                                                    <span>
                                                        <IconButton
                                                            onClick={() => loadOptions(field)}
                                                            disabled={loadingField === field.key}
                                                            sx={{ mt: 0.5 }}
                                                        >
                                                            {loadingField === field.key ? (
                                                                <CircularProgress size={20} />
                                                            ) : (
                                                                <RefreshIcon fontSize="small" />
                                                            )}
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        );
                                    }

                                    return (
                                        <TextField
                                            key={field.key}
                                            label={field.required && !alreadySet ? `${field.label} *` : field.label}
                                            required={field.required && !alreadySet}
                                            fullWidth
                                            size="small"
                                            type={field.type === 'password' ? 'password' : 'text'}
                                            placeholder={placeholder}
                                            value={data.credentials[field.key] ?? ''}
                                            onChange={(e) => setCredential(field.key, e.target.value)}
                                            error={Boolean(errors[`credentials.${field.key}`])}
                                            helperText={errors[`credentials.${field.key}`]}
                                        />
                                    );
                                })}
                            </Stack>
                        </Paper>
                    )}

                    {/* Status Panel */}
                    <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, bgcolor: '#fff' }}>
                        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                            Status
                        </Typography>
                        <Stack direction="row" spacing={3}>
                            <FormControlLabel
                                control={<Checkbox checked={data.enabled} onChange={(e) => setData('enabled', e.target.checked)} />}
                                label="Enabled"
                            />
                            <FormControlLabel
                                control={<Checkbox checked={data.is_default} onChange={(e) => setData('is_default', e.target.checked)} />}
                                label="Set as default (used for all translation jobs)"
                            />
                        </Stack>
                    </Paper>
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 3, maxWidth: 800 }}>
                        Please correct the highlighted fields before saving.
                    </Alert>
                )}
            </Box>
        </AppLayout>
    );
}
