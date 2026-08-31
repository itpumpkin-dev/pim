import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, Checkbox, CircularProgress, FormControl, FormControlLabel, MenuItem, Select, Stack, Typography } from '@mui/material';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

const attributeTypeKeys: Record<string, string> = {
    text: 'attrTypeText',
    textarea: 'attrTypeTextarea',
    price: 'attrTypePrice',
    number: 'attrTypeNumber',
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

    const { data, setData, post, processing, errors, isDirty } = useForm<AttributeForm>({
        type: 'text',
        swatch_type: '',
        is_required: false,
        is_unique: false,
        // ตั้งค่าเริ่มต้นให้ติ๊ก "ค่าต่อภาษา" ไว้ — แอตทริบิวต์ส่วนใหญ่ที่สร้างใหม่
        // ต้องการค่าแยกตามภาษาอยู่แล้ว ผู้ใช้ติ๊กออกเองได้ถ้าไม่ต้องการ
        is_locale_based: true,
        is_ai_translate: true,
        is_channel_based: false,
        is_filterable: false,
        translations: {},
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
        post('/catalog/attributes', {
            onSuccess: () => router.visit('/catalog/attributes', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('addAttributeTitle')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%', width: '100%', maxWidth: 760 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('addAttributeTitle')}</Typography>
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

                <Stack spacing={2}>
                    <FioriFormGroup title={t('generalTitle')}>
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
                            <FormControlLabel
                                control={<Checkbox checked={data.is_required} onChange={(event) => setData('is_required', event.target.checked)} />}
                                label={t('isRequired')}
                            />
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
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
            </Box>
        </AppLayout>
    );
}
