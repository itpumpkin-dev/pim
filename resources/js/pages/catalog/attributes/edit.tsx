import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { AttributeOptionsPanel, type AttributeOptionItem } from '@/components/catalog/attribute-options-panel';
import { HistoryPanel } from '@/components/history-panel';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

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
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%', width: '100%' }}>
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

                {tabIndex === 1 && canViewHistory && <HistoryPanel historyUrl={`/catalog/attributes/${attribute.id}/history`} />}

                {tabIndex === 0 && (
                <>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('editAttributeTitle')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/attributes" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>{t('back')}</Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                            sx={{ ...fioriEmphasizedSx, px: 2.5 }}
                        >
                            {processing ? t('saving') : t('saveAttribute')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2} sx={{ maxWidth: 760 }}>
                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField label={t('code')} htmlFor="attribute-code" hint={t('codeLockedHelperText')}>
                            <TextField id="attribute-code" fullWidth size="small" value={data.code} disabled sx={fioriFieldStateSx('none')} />
                        </FioriField>

                        <FioriField label={t('typeLabel')} htmlFor="attribute-type" required valueState={valueStateOf(errors.type)} message={errors.type}>
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.type))}>
                                <Select id="attribute-type" value={data.type} onChange={(event) => handleTypeChange(event.target.value)}>
                                    {attributeTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </FioriField>

                        {showSwatchType && (
                            <FioriField
                                label={t('swatchTypeLabel')}
                                htmlFor="attribute-swatch-type"
                                required
                                valueState={valueStateOf(errors.swatch_type)}
                                message={errors.swatch_type}
                            >
                                <FormControl fullWidth size="small" sx={fioriFieldStateSx(valueStateOf(errors.swatch_type))}>
                                    <Select id="attribute-swatch-type" value={data.swatch_type} onChange={(event) => setData('swatch_type', event.target.value)}>
                                        {swatchTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </FioriField>
                        )}
                    </FioriFormGroup>

                    <FioriFormGroup title={t('validationsTitle')}>
                        <FioriField label="">
                            <FormControlLabel control={<Checkbox checked={data.is_required} onChange={(event) => setData('is_required', event.target.checked)} />} label={t('isRequired')} />
                        </FioriField>
                    </FioriFormGroup>

                    <FioriFormGroup title={t('configurationTitle')}>
                        <FioriField label="">
                            <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap">
                                <FormControlLabel control={<Checkbox checked={data.is_locale_based} onChange={(event) => setData('is_locale_based', event.target.checked)} />} label={t('valuePerLocale')} />
                                <FormControlLabel control={<Checkbox checked={data.is_ai_translate} onChange={(event) => setData('is_ai_translate', event.target.checked)} />} label={t('aiTranslate')} />
                                <FormControlLabel control={<Checkbox checked={data.is_channel_based} onChange={(event) => setData('is_channel_based', event.target.checked)} />} label={t('valuePerChannel')} />
                                <FormControlLabel control={<Checkbox checked={data.is_filterable} onChange={(event) => setData('is_filterable', event.target.checked)} />} label={t('isFilterable')} />
                            </Stack>
                        </FioriField>
                    </FioriFormGroup>

                    <LocaleLabelFields
                        title={t('labelTitle')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    {showSwatchType && (
                        <AttributeOptionsPanel attributeId={attribute.id} swatchType={data.swatch_type} options={options} />
                    )}
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
                </>
                )}
            </Box>
        </AppLayout>
    );
}
