import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Box, Button, Checkbox, FormControl, FormControlLabel, FormHelperText, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import type { FormEvent } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'CATALOG', href: '#' },
    { title: 'ATTRIBUTES', href: '/catalog/attributes' },
    { title: 'ADD ATTRIBUTE', href: '/catalog/attributes/create' },
];

const attributeTypes = [
    { value: 'text', label: 'Text' },
    { value: 'textarea', label: 'Textarea' },
    { value: 'price', label: 'Price' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'select', label: 'Select' },
    { value: 'multiselect', label: 'Multiselect' },
    { value: 'datetime', label: 'Datetime' },
    { value: 'date', label: 'Date' },
    { value: 'image', label: 'Image' },
    { value: 'gallery', label: 'Gallery' },
    { value: 'file', label: 'File' },
    { value: 'checkbox', label: 'Checkbox' },
];

interface AttributeForm {
    code: string;
    name: string;
    type: string;
    is_required: boolean;
    is_unique: boolean;
    is_locale_based: boolean;
    is_ai_translate: boolean;
    is_channel_based: boolean;
    is_filterable: boolean;
    [key: string]: string | boolean;
}

export default function AttributeCreate() {
    const { data, setData, post, processing, errors } = useForm<AttributeForm>({
        code: '',
        name: '',
        type: 'text',
        is_required: false,
        is_unique: false,
        is_locale_based: false,
        is_ai_translate: false,
        is_channel_based: false,
        is_filterable: false,
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        post('/catalog/attributes', {
            onSuccess: () => router.visit('/catalog/attributes', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Add Attribute" />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>Add Attribute</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/attributes" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>Back</Button>
                        <Button sx={{ color: "white" }} type="submit" variant="contained" disabled={processing} startIcon={<SaveIcon />}>Save Attribute</Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>General</Typography>
                        <Stack spacing={2}>
                            <TextField
                                label="Code"
                                required
                                fullWidth
                                value={data.code}
                                onChange={(event) =>
                                    setData(
                                        'code',
                                        event.target.value
                                            .toLowerCase()
                                            .replace(/\s+/g, '_')
                                            .replace(/[^a-z0-9_]/g, ''),
                                    )
                                }
                                error={Boolean(errors.code)}
                                helperText={errors.code ?? 'Use lowercase letters, numbers, and underscores.'}
                            />
                            <FormControl fullWidth required error={Boolean(errors.type)}>
                                <InputLabel id="attribute-type-label">Type</InputLabel>
                                <Select labelId="attribute-type-label" label="Type" value={data.type} onChange={(event) => setData('type', event.target.value)}>
                                    {attributeTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}
                                </Select>
                                {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
                            </FormControl>
                        </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Validations</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <FormControlLabel control={<Checkbox checked={data.is_required} onChange={(event) => setData('is_required', event.target.checked)} />} label="Is Required" />
                            <FormControlLabel control={<Checkbox checked={data.is_unique} onChange={(event) => setData('is_unique', event.target.checked)} />} label="Is Unique" />
                        </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>Configuration</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap">
                            <FormControlLabel control={<Checkbox checked={data.is_locale_based} onChange={(event) => setData('is_locale_based', event.target.checked)} />} label="Value Per Locale" />
                            <FormControlLabel control={<Checkbox checked={data.is_ai_translate} onChange={(event) => setData('is_ai_translate', event.target.checked)} />} label="AI Translate" />
                            <FormControlLabel control={<Checkbox checked={data.is_channel_based} onChange={(event) => setData('is_channel_based', event.target.checked)} />} label="Value Per Channel" />
                            <FormControlLabel control={<Checkbox checked={data.is_filterable} onChange={(event) => setData('is_filterable', event.target.checked)} />} label="Is Filterable" />
                        </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700}>Label</Typography>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>English (United States)</Typography>
                        <TextField label="Label" fullWidth value={data.name} onChange={(event) => setData('name', event.target.value)} error={Boolean(errors.name)} helperText={errors.name} />
                    </Paper>
                </Stack>

                {Object.keys(errors).length > 0 && <Alert severity="error" sx={{ mt: 2 }}>Please correct the highlighted fields before saving.</Alert>}
            </Box>
        </AppLayout>
    );
}
