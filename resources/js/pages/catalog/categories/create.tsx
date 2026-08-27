import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/CloudUpload';
import {
    Box,
    Button,
    Checkbox,
    CircularProgress,
    FormControl,
    FormControlLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/hooks/use-locale';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';
import { CategoryFieldInput, type CategoryFieldItem } from '@/components/catalog/category-field-input';
import { CategoryParentTreePicker } from '@/components/category-parent-tree-picker';
import { FioriField, FioriFormErrorSummary, FioriFormGroup, fioriFieldStateSx, valueStateOf } from '@/components/fiori-form';
import { FIORI, fioriDefaultSx, fioriEmphasizedSx } from '@/lib/fiori-style';

interface Props {
    categoryFields: CategoryFieldItem[];
}

export default function CategoryCreate({ categoryFields = [] }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { locales, locale: currentLocaleCode } = useLocale();
    const currentLocaleId = locales.find((l) => l.code === currentLocaleCode)?.id || 1;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' },
        { title: t('createCategory'), href: '/catalog/categories/create' },
    ];

    const { data, setData, post, processing, errors, transform, isDirty } = useForm({
        translations: {} as Record<string, string>,
        is_ai_translate: true as boolean,
        description: '',
        parent_id: 'root' as string | number,
        additional_data: {} as Record<string, any>,
        slug: '',
        display_type: 'default' as 'default' | 'products' | 'subcategories' | 'both',
        thumbnail: null as File | null,
        is_active: true as boolean,
    });
    const skipNavigationGuardRef = useUnsavedChangesGuard(isDirty);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((formData) => ({
            ...formData,
            parent_id: formData.parent_id === 'root' ? '' : formData.parent_id,
        }));
        skipNavigationGuardRef.current = true;
        post('/catalog/categories', {
            onSuccess: () => router.visit('/catalog/categories', { replace: true }),
            onFinish: () => {
                skipNavigationGuardRef.current = false;
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('createCategory')} />
            <Box component="form" onSubmit={submit} sx={{ p: { xs: 2, md: 4 }, width: '100%', maxWidth: 760, bgcolor: FIORI.pageBg }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('createCategory')}</Typography>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/catalog/categories" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button type="submit" variant="contained" disabled={processing} startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} sx={fioriEmphasizedSx}>
                            {processing ? t('saving') : t('save')}
                        </Button>
                    </Stack>
                </Stack>

                <Stack spacing={2}>
                    <LocaleLabelFields
                        title={t('name')}
                        description={t('nameHelperText')}
                        values={data.translations}
                        onChange={(localeId, value) => setData('translations', { ...data.translations, [localeId]: value })}
                    />

                    <FioriFormGroup title={t('generalTitle')}>
                        <FioriField
                            label={t('slug')}
                            htmlFor="category-slug"
                            valueState={valueStateOf(errors.slug)}
                            message={errors.slug}
                            hint={t('slugHelperText')}
                        >
                            <TextField
                                id="category-slug"
                                fullWidth
                                size="small"
                                value={data.slug}
                                onChange={(e) => setData('slug', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.slug))}
                            />
                        </FioriField>

                        <FioriField
                            label={t('parentCategory')}
                            valueState={valueStateOf(errors.parent_id)}
                            message={errors.parent_id}
                            hint={t('parentCategoryHelperText')}
                            fullWidth
                        >
                            <CategoryParentTreePicker
                                value={typeof data.parent_id === 'number' ? data.parent_id : ''}
                                onChange={(id) => setData('parent_id', id === '' ? 'root' : id)}
                                rootLabel={t('rootCategory')}
                            />
                        </FioriField>

                        <FioriField
                            label={t('description')}
                            htmlFor="category-description"
                            valueState={valueStateOf(errors.description)}
                            message={errors.description}
                            hint={t('descriptionHelperText')}
                            fullWidth
                        >
                            <TextField
                                id="category-description"
                                fullWidth
                                size="small"
                                multiline
                                rows={4}
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                sx={fioriFieldStateSx(valueStateOf(errors.description))}
                            />
                        </FioriField>

                        <FioriField label={t('displayType')} htmlFor="category-display-type">
                            <FormControl fullWidth size="small" sx={fioriFieldStateSx('none')}>
                                <Select
                                    id="category-display-type"
                                    value={data.display_type}
                                    onChange={(e) => setData('display_type', e.target.value as typeof data.display_type)}
                                >
                                    <MenuItem value="default">{t('displayTypeDefault')}</MenuItem>
                                    <MenuItem value="products">{t('displayTypeProducts')}</MenuItem>
                                    <MenuItem value="subcategories">{t('displayTypeSubcategories')}</MenuItem>
                                    <MenuItem value="both">{t('displayTypeBoth')}</MenuItem>
                                </Select>
                            </FormControl>
                        </FioriField>

                        <FioriField label={t('thumbnail')} valueState={valueStateOf(errors.thumbnail)} message={errors.thumbnail}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <Button component="label" variant="outlined" startIcon={<UploadIcon />} sx={fioriDefaultSx}>
                                    {t('chooseFile')}
                                    <input
                                        type="file"
                                        hidden
                                        accept="image/*"
                                        onChange={(e) => setData('thumbnail', e.target.files?.[0] ?? null)}
                                    />
                                </Button>
                                {data.thumbnail && (
                                    <Typography variant="body2" color="text.secondary">{data.thumbnail.name}</Typography>
                                )}
                            </Stack>
                        </FioriField>

                        <FioriField label="">
                            <Stack>
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_ai_translate} onChange={(e) => setData('is_ai_translate', e.target.checked)} />}
                                    label={t('aiTranslate')}
                                />
                                <FormControlLabel
                                    control={<Checkbox checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />}
                                    label={t('active')}
                                />
                            </Stack>
                        </FioriField>
                    </FioriFormGroup>

                    {categoryFields.length > 0 && (
                        <FioriFormGroup title="หมวดหมู่แอตทริบิวต์เพิ่มเติม (Dynamic Fields)">
                            {categoryFields.map((field) => {
                                const fieldLabel = field.labels[currentLocaleId] || Object.values(field.labels)[0] || field.code;
                                const fieldValue = data.additional_data[field.code] ?? '';
                                const fieldError = errors[`additional_data.${field.code}` as keyof typeof errors];

                                return (
                                    <FioriField
                                        key={field.id}
                                        label={fieldLabel}
                                        required={field.is_required}
                                        valueState={valueStateOf(fieldError)}
                                        message={fieldError}
                                    >
                                        <CategoryFieldInput
                                            field={field}
                                            value={fieldValue}
                                            onChange={(value) => setData('additional_data', { ...data.additional_data, [field.code]: value })}
                                            error={fieldError}
                                        />
                                    </FioriField>
                                );
                            })}
                        </FioriFormGroup>
                    )}
                </Stack>

                <FioriFormErrorSummary errors={errors} message={t('correctHighlightedFields')} sx={{ mt: 2, maxWidth: 760 }} />
            </Box>
        </AppLayout>
    );
}
