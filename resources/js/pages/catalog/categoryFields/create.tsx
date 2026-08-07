import AppLayout from '@/layouts/app-layout';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { OptionListEditor } from '@/components/catalog/option-list-editor';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

export default function CategoryFieldCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categoryFields'), href: '/catalog/categoryFields' },
        { title: 'Create Field', href: '/catalog/categoryFields/create' },
    ];

    const { data, setData, post, processing, errors } = useForm({
        type: 'Text',
        labels: {} as Record<string, string>,
        options: [] as string[],
        is_required: false,
        status: true,
        position: 0,
        display_section: 'General',
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        post('/catalog/categoryFields', {
            onSuccess: () => router.visit('/catalog/categoryFields', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Create Category Field" />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>Create Category Field</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/categoryFields" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {t('back')}
                        </Button>
                        <Button sx={{ color: "white" }} type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>General Config</Typography>
                        <Stack spacing={3}>
                            <FormControl fullWidth required>
                                <InputLabel id="field-type-label">Field Type</InputLabel>
                                <Select
                                    labelId="field-type-label"
                                    label="Field Type"
                                    value={data.type}
                                    onChange={(e) => setData('type', e.target.value)}
                                >
                                    <MenuItem value="Text">Text</MenuItem>
                                    <MenuItem value="Textarea">Textarea</MenuItem>
                                    <MenuItem value="Boolean">Boolean</MenuItem>
                                    <MenuItem value="Select">Select</MenuItem>
                                    <MenuItem value="Multiselect">Multiselect</MenuItem>
                                    <MenuItem value="Datetime">Datetime</MenuItem>
                                    <MenuItem value="Date">Date</MenuItem>
                                    <MenuItem value="Image">Image</MenuItem>
                                    <MenuItem value="File">File</MenuItem>
                                    <MenuItem value="Checkbox">Checkbox</MenuItem>
                                </Select>
                            </FormControl>

                            {(data.type === 'Select' || data.type === 'Multiselect') && (
                                <Box>
                                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                                        Options
                                    </Typography>
                                    <OptionListEditor value={data.options} onChange={(options) => setData('options', options)} />
                                </Box>
                            )}

                            <TextField
                                label="Position"
                                type="number"
                                fullWidth
                                value={data.position}
                                onChange={(e) => setData('position', Number(e.target.value))}
                                error={Boolean(errors.position)}
                                helperText={errors.position}
                            />

                            <TextField
                                label="Display Section"
                                fullWidth
                                value={data.display_section}
                                onChange={(e) => setData('display_section', e.target.value)}
                                error={Boolean(errors.display_section)}
                                helperText={errors.display_section ?? 'Optional UI grouping name'}
                            />

                            <Stack direction="row" spacing={3}>
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_required} onChange={(e) => setData('is_required', e.target.checked)} />}
                                    label="Required field"
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={data.status} onChange={(e) => setData('status', e.target.checked)} />}
                                    label="Status Active"
                                />
                            </Stack>
                        </Stack>
                    </Paper>

                    <LocaleLabelFields
                        title="Field Labels"
                        values={data.labels}
                        onChange={(localeId, value) => setData('labels', { ...data.labels, [localeId]: value })}
                    />
                </Stack>

                {Object.keys(errors).length > 0 && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {t('correctHighlightedFields')}
                    </Alert>
                )}
            </Box>
        </AppLayout>
    );
}
