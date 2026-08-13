import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, FormHelperText, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

const attributeTypeKeys: Record<string, string> = {
    text: 'attrTypeText',
    textarea: 'attrTypeTextarea',
    price: 'attrTypePrice',
    boolean: 'attrTypeBoolean',
    select: 'attrTypeSelect',
    multiselect: 'attrTypeMultiselect',
    datetime: 'attrTypeDatetime',
    date: 'attrTypeDate',
    image: 'attrTypeImage',
    gallery: 'attrTypeGallery',
    file: 'attrTypeFile',
    checkbox: 'attrTypeCheckbox',
    video: 'attrTypeVideo',
};

const swatchTypeKeys: Record<string, string> = {
    text: 'swatchTypeText',
    color: 'swatchTypeColor',
    image: 'swatchTypeImage',
};

interface AttributeForm {
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

export default function AttributeCreate() {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('attributes'), href: '/catalog/attributes' },
        { title: t('addAttributeTitle'), href: '/catalog/attributes/create' },
    ];

    const attributeTypes = Object.entries(attributeTypeKeys).map(([value, key]) => ({
        value,
        label: t(key),
    }));

    const swatchTypes = Object.entries(swatchTypeKeys).map(([value, key]) => ({
        value,
        label: t(key),
    }));

    const { data, setData, post, processing, errors } = useForm<AttributeForm>({
        type: 'text',
        swatch_type: '',
        is_required: false,
        is_unique: false,
        is_locale_based: false,
        is_ai_translate: true,
        is_channel_based: false,
        is_filterable: false,
        translations: {},
    });

    const showSwatchType = data.type === 'select' || data.type === 'multiselect';

    const handleTypeChange = (value: string) => {
        setData('type', value);
        if (value !== 'select' && value !== 'multiselect') {
            setData('swatch_type', '');
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        post('/catalog/attributes', {
            onSuccess: () => router.visit('/catalog/attributes', { replace: true }),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('addAttributeTitle')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('addAttributeTitle')}</Typography>
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
                </Stack>

                {Object.keys(errors).length > 0 && <Alert severity="error" sx={{ mt: 2 }}>{t('correctHighlightedFields')}</Alert>}
            </Box>
        </AppLayout>
    );
}
