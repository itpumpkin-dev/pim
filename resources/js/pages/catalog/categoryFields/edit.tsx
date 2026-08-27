import AppLayout from '@/layouts/app-layout';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { OptionListEditor } from '@/components/catalog/option-list-editor';
import { HistoryPanel } from '@/components/history-panel';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

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

interface Props {
    field: CategoryFieldItem;
    canViewHistory?: boolean;
}

export default function CategoryFieldEdit({ field, canViewHistory = false }: Props) {
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

    const submit = (event: FormEvent) => {
        event.preventDefault();
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
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                {canViewHistory && (
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{ mb: 3, borderBottom: `1px solid ${FIORI.border}` }}
                    >
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/categoryFields/${field.id}/history`} />}

                {tabIndex === 0 && (
                <>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>Edit Category Field</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/categoryFields" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <FioriFormGroup title="General Config">
                        <FioriField label="Code" htmlFor="field-code" hint="This code is generated automatically and can't be changed.">
                            <TextField id="field-code" fullWidth size="small" value={data.code} disabled sx={fioriFieldStateSx('none')} />
                        </FioriField>

                        <FioriField label="Field Type" htmlFor="field-type" required>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx('none')}>
                                <Select id="field-type" value={data.type} onChange={(e) => setData('type', e.target.value)}>
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
                        </FioriField>

                        {(data.type === 'Select' || data.type === 'Multiselect') && (
                            <FioriField label="Options" fullWidth>
                                <OptionListEditor value={data.options} onChange={(options) => setData('options', options)} />
                            </FioriField>
                        )}

                        <FioriField label="Position" htmlFor="field-position" valueState={valueStateOf(errors.position)} message={errors.position}>
                            <TextField
                                id="field-position"
                                type="number"
                                fullWidth
                                size="small"
                                value={data.position}
                                onChange={(e) => setData('position', Number(e.target.value))}
                                sx={fioriFieldStateSx(valueStateOf(errors.position))}
                            />
                        </FioriField>

                        <FioriField
                            label="Display Section"
                            htmlFor="field-display-section"
                            valueState={valueStateOf(errors.display_section)}
                            message={errors.display_section}
                            hint="Optional UI grouping name"
                        >
                            <TextField
                                id="field-display-section"
                                fullWidth
                                size="small"
                                value={data.display_section}
                                onChange={(e) => setData('display_section', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.display_section))}
                            />
                        </FioriField>

                        <FioriField label="">
                            <Stack direction="row" spacing={3} flexWrap="wrap">
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_required} onChange={(e) => setData('is_required', e.target.checked)} />}
                                    label="Required field"
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_ai_translate} onChange={(e) => setData('is_ai_translate', e.target.checked)} />}
                                    label={t('aiTranslate')}
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={data.status} onChange={(e) => setData('status', e.target.checked)} />}
                                    label="Status Active"
                                />
                            </Stack>
                        </FioriField>
                    </FioriFormGroup>

                    <LocaleLabelFields
                        title="Field Labels"
                        values={data.labels}
                        onChange={(localeId, value) => setData('labels', { ...data.labels, [localeId]: value })}
                    />
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
                </>
                )}
            </Box>
        </AppLayout>
    );
}
