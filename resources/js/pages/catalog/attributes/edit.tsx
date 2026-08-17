import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { AttributeOptionsPanel, type AttributeOptionItem } from '@/components/catalog/attribute-options-panel';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, FormHelperText, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const swatchTypeKeys: Record<string, string> = {
    text: 'swatchTypeText',
    color: 'swatchTypeColor',
    image: 'swatchTypeImage',
};

interface Attribute {
    id: number;
    code: string;
    name: string;
    type: string;
    swatch_type: string | null;
    is_required: boolean;
    is_unique: boolean;
    is_locale_based: boolean;
    is_ai_translate: boolean;
    is_channel_based: boolean;
    is_filterable: boolean;
}

interface AttributeForm {
    code: string;
    type: string;
    swatch_type: string;
    is_required: boolean;
    is_unique: boolean;
    is_locale_based: boolean;
    is_ai_translate: boolean;
    is_channel_based: boolean;
    is_filterable: boolean;
    translations: Record<string, string>;
    [key: string]: string | boolean | Record<string, string>;
}

interface Props {
    attribute: Attribute;
    translations: Record<string, string>;
    options?: AttributeOptionItem[];
    canViewHistory?: boolean;
}

export default function AttributeEdit({ attribute, translations, options = [], canViewHistory = false }: Props) {
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
        is_required: Boolean(attribute.is_required),
        is_unique: Boolean(attribute.is_unique),
        is_locale_based: Boolean(attribute.is_locale_based),
        is_ai_translate: Boolean(attribute.is_ai_translate),
        is_channel_based: Boolean(attribute.is_channel_based),
        is_filterable: Boolean(attribute.is_filterable),
        translations: translations || {},
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const showSwatchType = data.type === 'select' || data.type === 'multiselect';

    const handleTypeChange = (value: string) => {
        setData('type', value);
        if (value !== 'select' && value !== 'multiselect') {
            setData('swatch_type', '');
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
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
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                {canViewHistory && (
                    <Tabs
                        value={tabIndex}
                        onChange={(_, v) => setTabIndex(v)}
                        sx={{ mb: 3, borderBottom: '1px solid #e2e8f0' }}
                    >
                        <Tab label="General" />
                        <Tab label="History" />
                    </Tabs>
                )}

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/attributes/${attribute.id}/history`} />}

                {tabIndex === 0 && (
                <>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('editAttributeTitle')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/attributes" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>{t('back')}</Button>
                        <Button
                            sx={{ color: "white" }}
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                        >
                            {processing ? t('saving') : t('saveAttribute')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('generalTitle')}</Typography>
                        <Stack spacing={2}>
                            <TextField
                                label={t('code')}
                                fullWidth
                                value={data.code}
                                disabled
                                helperText={t('codeLockedHelperText')}
                            />
                            <FormControl fullWidth required error={Boolean(errors.type)}>
                                <InputLabel id="attribute-type-label">{t('typeLabel')}</InputLabel>
                                <Select labelId="attribute-type-label" label={t('typeLabel')} value={data.type} onChange={(event) => handleTypeChange(event.target.value)}>
                                    {attributeTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}
                                </Select>
                                {errors.type && <FormHelperText>{errors.type}</FormHelperText>}
                            </FormControl>
                            {showSwatchType && (
                                <FormControl fullWidth required error={Boolean(errors.swatch_type)}>
                                    <InputLabel id="attribute-swatch-type-label">{t('swatchTypeLabel')}</InputLabel>
                                    <Select labelId="attribute-swatch-type-label" label={t('swatchTypeLabel')} value={data.swatch_type} onChange={(event) => setData('swatch_type', event.target.value)}>
                                        {swatchTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}
                                    </Select>
                                    {errors.swatch_type && <FormHelperText>{errors.swatch_type}</FormHelperText>}
                                </FormControl>
                            )}
                        </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>{t('validationsTitle')}</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <FormControlLabel control={<Checkbox checked={data.is_required} onChange={(event) => setData('is_required', event.target.checked)} />} label={t('isRequired')} />
                            {/* <FormControlLabel control={<Checkbox checked={data.is_unique} onChange={(event) => setData('is_unique', event.target.checked)} />} label={t('isUnique')} /> */}
                        </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>{t('configurationTitle')}</Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap">
                            <FormControlLabel control={<Checkbox checked={data.is_locale_based} onChange={(event) => setData('is_locale_based', event.target.checked)} />} label={t('valuePerLocale')} />
                            <FormControlLabel control={<Checkbox checked={data.is_ai_translate} onChange={(event) => setData('is_ai_translate', event.target.checked)} />} label={t('aiTranslate')} />
                            <FormControlLabel control={<Checkbox checked={data.is_channel_based} onChange={(event) => setData('is_channel_based', event.target.checked)} />} label={t('valuePerChannel')} />
                            <FormControlLabel control={<Checkbox checked={data.is_filterable} onChange={(event) => setData('is_filterable', event.target.checked)} />} label={t('isFilterable')} />
                        </Stack>
                    </Paper>

                    <LocaleLabelFields
                        title={t('labelTitle')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    {showSwatchType && (
                        <AttributeOptionsPanel attributeId={attribute.id} swatchType={data.swatch_type} options={options} />
                    )}
                </Stack>

                {Object.keys(errors).length > 0 && <Alert severity="error" sx={{ mt: 2 }}>{t('correctHighlightedFields')}</Alert>}
                </>
                )}
            </Box>
        </AppLayout>
    );
}
